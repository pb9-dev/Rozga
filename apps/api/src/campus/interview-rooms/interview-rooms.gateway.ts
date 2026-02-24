import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { sha256 } from '../../auth/token-hash';

type JwtPayload = {
  sub: string;
  tenantId: string;
  roles: Role[];
  email: string;
};

type RoomState = {
  firstSocketId?: string;
  sockets: Set<string>;
};

@WebSocketGateway({
  namespace: '/ws/interviews',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class InterviewRoomsGateway {
  @WebSocketServer()
  server!: Server;

  private readonly roomState = new Map<string, RoomState>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  private getOrCreateState(roomId: string): RoomState {
    const existing = this.roomState.get(roomId);
    if (existing) return existing;
    const created: RoomState = { sockets: new Set() };
    this.roomState.set(roomId, created);
    return created;
  }

  private async resolveRoomIdFromCandidateToken(token: string): Promise<string> {
    const room = await this.prisma.interviewRoom.findUnique({
      where: { candidateTokenHash: sha256(token) },
      select: { id: true, endedAt: true, expiresAt: true },
    });
    if (!room) throw new Error('Room not found');
    if (room.endedAt) throw new Error('Interview ended');
    if (room.expiresAt && room.expiresAt.getTime() <= Date.now()) throw new Error('Link expired');
    return room.id;
  }

  private async resolveRoomIdForAssignment(params: {
    assignmentId: string;
    requester: JwtPayload;
  }): Promise<string> {
    const { assignmentId, requester } = params;

    const assignment = await this.prisma.interviewAssignment.findFirst({
      where: { id: assignmentId, tenantId: requester.tenantId },
      select: {
        id: true,
        interviewerId: true,
        room: { select: { id: true, endedAt: true, expiresAt: true } },
      },
    });
    if (!assignment) throw new Error('Assignment not found');

    const isPrivileged = requester.roles.includes('Admin' as Role) || requester.roles.includes('HR' as Role);
    if (!isPrivileged && assignment.interviewerId !== requester.sub) throw new Error('Not your assignment');

    const room = assignment.room;
    if (!room) throw new Error('Room not created yet');
    if (room.endedAt) throw new Error('Interview ended');
    if (room.expiresAt && room.expiresAt.getTime() <= Date.now()) throw new Error('Link expired');

    return room.id;
  }

  private parseJwtFromSocket(socket: Socket): JwtPayload | null {
    const token = (socket.handshake.auth?.accessToken as string | undefined) ?? null;
    if (!token) return null;

    const secret = this.config.get<string>('JWT_ACCESS_SECRET', { infer: true });
    if (!secret) return null;

    try {
      const payload = this.jwt.verify(token, { secret }) as JwtPayload;
      if (!payload?.sub || !payload?.tenantId) return null;
      return payload;
    } catch {
      return null;
    }
  }

  @SubscribeMessage('room:join')
  async onJoin(
    @ConnectedSocket() socket: Socket,
    @MessageBody()
    body: {
      candidateToken?: string;
      assignmentId?: string;
    },
  ) {
    const candidateToken = body?.candidateToken?.trim();
    const assignmentId = body?.assignmentId?.trim();

    let roomId: string;
    let role: 'candidate' | 'interviewer';

    if (candidateToken) {
      roomId = await this.resolveRoomIdFromCandidateToken(candidateToken);
      role = 'candidate';
    } else if (assignmentId) {
      const requester = this.parseJwtFromSocket(socket);
      if (!requester) throw new Error('Unauthorized');
      roomId = await this.resolveRoomIdForAssignment({ assignmentId, requester });
      role = 'interviewer';
    } else {
      throw new Error('Invalid join payload');
    }

    const state = this.getOrCreateState(roomId);

    // Allow at most 2 active sockets in a room.
    if (state.sockets.size >= 2 && !state.sockets.has(socket.id)) {
      throw new Error('Room already has 2 participants');
    }

    await socket.join(roomId);
    state.sockets.add(socket.id);

    if (!state.firstSocketId) state.firstSocketId = socket.id;

    socket.emit('room:joined', { roomId, role });

    // If we now have 2 participants, notify both who should initiate.
    if (state.sockets.size === 2) {
      const [a, b] = Array.from(state.sockets);
      // initiator = first socket that ever joined
      const first = state.firstSocketId ?? a;
      const second = first === a ? b : a;

      this.server.to(first).emit('room:peer', { roomId, peerSocketId: second, initiator: true });
      this.server.to(second).emit('room:peer', { roomId, peerSocketId: first, initiator: false });
    }

    return { ok: true };
  }

  @SubscribeMessage('signal:offer')
  onOffer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { roomId: string; targetSocketId: string; sdp: unknown },
  ) {
    this.server.to(body.targetSocketId).emit('signal:offer', {
      roomId: body.roomId,
      fromSocketId: socket.id,
      sdp: body.sdp,
    });
    return { ok: true };
  }

  @SubscribeMessage('signal:answer')
  onAnswer(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { roomId: string; targetSocketId: string; sdp: unknown },
  ) {
    this.server.to(body.targetSocketId).emit('signal:answer', {
      roomId: body.roomId,
      fromSocketId: socket.id,
      sdp: body.sdp,
    });
    return { ok: true };
  }

  @SubscribeMessage('signal:ice')
  onIce(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { roomId: string; targetSocketId: string; candidate: unknown },
  ) {
    this.server.to(body.targetSocketId).emit('signal:ice', {
      roomId: body.roomId,
      fromSocketId: socket.id,
      candidate: body.candidate,
    });
    return { ok: true };
  }

  // Cleanup on disconnect
  handleDisconnect(socket: Socket) {
    for (const [roomId, state] of this.roomState.entries()) {
      if (!state.sockets.has(socket.id)) continue;

      state.sockets.delete(socket.id);
      socket.to(roomId).emit('room:peer-left', { roomId, peerSocketId: socket.id });

      if (state.firstSocketId === socket.id) {
        state.firstSocketId = state.sockets.values().next().value;
      }

      if (state.sockets.size === 0) {
        this.roomState.delete(roomId);
      }
    }
  }
}
