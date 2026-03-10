import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Role } from '@prisma/client';
import bcrypt from 'bcrypt';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { randomToken, sha256 } from './token-hash';

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async login(params: {
    tenantSlug: string;
    email: string;
    password: string;
    deviceName?: string;
  }): Promise<AuthTokens> {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug: params.tenantSlug } });
    if (!tenant) throw new UnauthorizedException('Invalid credentials');

    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: params.email.toLowerCase() } },
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(params.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.issueTokens({
      userId: user.id,
      tenantId: tenant.id,
      email: user.email,
      roles: user.roles as Role[],
    });

    await this.audit.log({
      tenantId: tenant.id,
      actorUserId: user.id,
      action: 'auth.login',
      entityType: 'User',
      entityId: user.id,
      meta: { deviceName: params.deviceName ?? null },
    });

    return tokens;
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const parsed = this.parseRefreshToken(refreshToken);

    const stored = await this.prisma.refreshToken.findUnique({ where: { id: parsed.id } });
    if (!stored || stored.revokedAt) throw new ForbiddenException('Refresh token revoked');
    if (stored.expiresAt.getTime() <= Date.now()) throw new ForbiddenException('Refresh token expired');

    const expectedHash = sha256(parsed.secret);
    if (stored.tokenHash !== expectedHash) throw new ForbiddenException('Invalid refresh token');

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user || !user.isActive) throw new ForbiddenException('User inactive');

    // rotate
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.issueTokens({
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      roles: user.roles as Role[],
    });

    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.id,
      action: 'auth.refresh',
      entityType: 'User',
      entityId: user.id,
    });

    return tokens;
  }

  async logout(params: { userId: string; tenantId: string; refreshToken?: string }) {
    if (params.refreshToken) {
      const parsed = this.parseRefreshToken(params.refreshToken);
      const tokenHash = sha256(parsed.secret);
      await this.prisma.refreshToken.updateMany({
        where: { id: parsed.id, userId: params.userId, tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.prisma.refreshToken.updateMany({
        where: { userId: params.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.audit.log({
      tenantId: params.tenantId,
      actorUserId: params.userId,
      action: 'auth.logout',
      entityType: 'User',
      entityId: params.userId,
    });
  }

  private async issueTokens(params: {
    userId: string;
    tenantId: string;
    email: string;
    roles: Role[];
  }): Promise<AuthTokens> {
    const accessTtlSeconds = this.config.get<number>('JWT_ACCESS_TTL_SECONDS', { infer: true }) ?? 900;
    const refreshTtlSeconds = this.config.get<number>('JWT_REFRESH_TTL_SECONDS', { infer: true }) ?? 60 * 60 * 24 * 30;

    const accessToken = await this.jwt.signAsync(
      {
        sub: params.userId,
        tenantId: params.tenantId,
        email: params.email,
        roles: params.roles,
      },
      {
        secret: this.config.get<string>('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: accessTtlSeconds,
      },
    );

    const refreshSecret = randomToken(48);
    const stored = await this.prisma.refreshToken.create({
      data: {
        userId: params.userId,
        tokenHash: sha256(refreshSecret),
        expiresAt: new Date(Date.now() + refreshTtlSeconds * 1000),
      },
    });

    // opaque refresh token => id.secret
    return {
      accessToken,
      refreshToken: `${stored.id}.${refreshSecret}`,
    };
  }

  private parseRefreshToken(token: string): { id: string; secret: string } {
    const idx = token.indexOf('.');
    if (idx <= 0 || idx >= token.length - 1) {
      throw new ForbiddenException('Invalid refresh token');
    }
    return { id: token.slice(0, idx), secret: token.slice(idx + 1) };
  }
}
