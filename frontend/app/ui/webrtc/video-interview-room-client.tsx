'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { Button } from '../button';
import { Card } from '../card';
import { Dialog } from '../dialog';

type Props =
  | {
      mode: 'candidate';
      candidateToken: string;
      apiOrigin: string;
    }
  | {
      mode: 'interviewer';
      assignmentId: string;
      apiOrigin: string;
    };

type PeerEvent = { roomId: string; peerSocketId: string; initiator: boolean };

export function VideoInterviewRoomClient(props: Props) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const localStreamRef = useRef<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerSocketIdRef = useRef<string | null>(null);

  const [status, setStatus] = useState<'idle' | 'connecting' | 'in-call' | 'ended' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [mediaWarning, setMediaWarning] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  const [hasAudioTrack, setHasAudioTrack] = useState(false);
  const [hasVideoTrack, setHasVideoTrack] = useState(false);

  const [permissionDialogOpen, setPermissionDialogOpen] = useState(true);
  const [permissionHelp, setPermissionHelp] = useState<string | null>(null);

  function isGetUserMediaError(e: unknown): e is { name?: string; message?: string } {
    return typeof e === 'object' && e !== null && ('name' in e || 'message' in e);
  }

  function friendlyMediaError(e: unknown) {
    if (!isGetUserMediaError(e)) return 'Could not access camera/microphone.';
    const name = String(e.name ?? '');
    const message = String(e.message ?? '');

    if (name === 'NotFoundError' || /requested device not found/i.test(message)) {
      return 'No camera/microphone found on this device. Joining without media.';
    }
    if (name === 'NotAllowedError' || /permission/i.test(message) || /denied/i.test(message)) {
      return 'Camera/microphone permission denied. Allow permissions and retry, or join without media.';
    }
    if (name === 'NotReadableError') {
      return 'Camera/microphone is already in use by another app. Close it and retry.';
    }
    if (name === 'OverconstrainedError') {
      return 'Your device cannot satisfy the requested media constraints. Trying a simpler mode.';
    }
    return message || 'Could not access camera/microphone.';
  }

  async function tryGetStream(constraints: MediaStreamConstraints): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Media devices not available in this browser context');
    }
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  function setLocalStream(stream: MediaStream | null) {
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    setHasAudioTrack(Boolean(stream?.getAudioTracks().length));
    setHasVideoTrack(Boolean(stream?.getVideoTracks().length));

    // reset toggles whenever we replace the stream
    setMuted(false);
    setCameraOff(false);
  }

  function isPermissionDeniedError(e: unknown) {
    if (!isGetUserMediaError(e)) return false;
    const name = String(e.name ?? '');
    const message = String(e.message ?? '');
    return name === 'NotAllowedError' || /permission/i.test(message) || /denied/i.test(message);
  }

  async function acquireMedia(params: { allowFallbacks: boolean }) {
    // First try full A/V.
    try {
      const av = await tryGetStream({ video: true, audio: true });
      return { stream: av, warning: null as string | null };
    } catch (e1) {
      if (isPermissionDeniedError(e1)) throw e1;
      if (!params.allowFallbacks) return { stream: null as MediaStream | null, warning: friendlyMediaError(e1) };

      // Fallback: audio-only.
      try {
        const a = await tryGetStream({ video: false, audio: true });
        return { stream: a, warning: 'Camera not available. Joined with audio only.' };
      } catch (e2) {
        if (isPermissionDeniedError(e2)) throw e2;
        return { stream: null as MediaStream | null, warning: friendlyMediaError(e2 ?? e1) };
      }
    }
  }

  const rtcConfig = useMemo(
    () =>
      ({
        iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
      }) satisfies RTCConfiguration,
    [],
  );

  const cleanup = useCallback(() => {
    try {
      socketRef.current?.disconnect();
    } catch {}
    socketRef.current = null;

    try {
      pcRef.current?.close();
    } catch {}
    pcRef.current = null;

    peerSocketIdRef.current = null;

    const local = localStreamRef.current;
    if (local) local.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;

    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    setHasAudioTrack(false);
    setHasVideoTrack(false);

    setStatus('ended');
  }, []);

  const ensurePeerConnection = useCallback(
    async (socket: Socket, peerSocketId: string, roomId: string) => {
      peerSocketIdRef.current = peerSocketId;

      if (pcRef.current) return pcRef.current;

      const pc = new RTCPeerConnection(rtcConfig);
      pcRef.current = pc;

      pc.onicecandidate = (ev) => {
        if (!ev.candidate) return;
        const targetSocketId = peerSocketIdRef.current;
        if (!targetSocketId) return;
        socket.emit('signal:ice', {
          roomId,
          targetSocketId,
          candidate: ev.candidate.toJSON(),
        });
      };

      pc.ontrack = (ev) => {
        const [stream] = ev.streams;
        if (remoteVideoRef.current && stream) {
          remoteVideoRef.current.srcObject = stream;
        }
      };

      // Attach local tracks
      const localStream = localVideoRef.current?.srcObject;
      if (localStream instanceof MediaStream) {
        for (const track of localStream.getTracks()) {
          pc.addTrack(track, localStream);
        }
      }

      return pc;
    },
    [rtcConfig],
  );

  const startWithOptions = useCallback(async ({ forceNoMedia }: { forceNoMedia?: boolean } = {}) => {
    setError(null);
    setMediaWarning(null);
    setPermissionHelp(null);
    setStatus('connecting');

    try {
      // If we don't already have a local stream, try to acquire one.
      if (!forceNoMedia && !localStreamRef.current) {
        try {
          const result = await acquireMedia({ allowFallbacks: true });
          setLocalStream(result.stream);
          if (result.warning) setMediaWarning(result.warning);
        } catch (mediaErr) {
          // Permission denied: show popup guidance and keep user in control.
          if (isPermissionDeniedError(mediaErr)) {
            setPermissionHelp(friendlyMediaError(mediaErr));
            setPermissionDialogOpen(true);
            setStatus('idle');
            return;
          }

          // Other errors: join without media.
          setLocalStream(null);
          setMediaWarning(friendlyMediaError(mediaErr));
        }
      }

      let accessToken: string | null = null;
      if (props.mode === 'interviewer') {
        const tokenRes = await fetch('/api/session/access-token', { cache: 'no-store' });
        if (!tokenRes.ok) throw new Error('Not authenticated');
        const json = (await tokenRes.json()) as { accessToken: string };
        accessToken = json.accessToken;
      }

      const socket = io(`${props.apiOrigin}/ws/interviews`, {
        transports: ['websocket'],
        withCredentials: true,
        auth: props.mode === 'interviewer' ? { accessToken } : {},
      });

      socketRef.current = socket;

      socket.on('connect_error', (e) => {
        setError(e?.message ?? 'Connection error');
        setStatus('error');
      });

      socket.on('room:joined', () => {
        // waiting for peer event
      });

      socket.on('room:peer', async (ev: PeerEvent) => {
        try {
          const pc = await ensurePeerConnection(socket, ev.peerSocketId, ev.roomId);

          if (ev.initiator) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('signal:offer', { roomId: ev.roomId, targetSocketId: ev.peerSocketId, sdp: offer });
          }

          setStatus('in-call');
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to start call');
          setStatus('error');
        }
      });

      socket.on('signal:offer', async (payload: { roomId: string; fromSocketId: string; sdp: RTCSessionDescriptionInit }) => {
        const pc = await ensurePeerConnection(socket, payload.fromSocketId, payload.roomId);
        await pc.setRemoteDescription(payload.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal:answer', { roomId: payload.roomId, targetSocketId: payload.fromSocketId, sdp: answer });
      });

      socket.on('signal:answer', async (payload: { roomId: string; fromSocketId: string; sdp: RTCSessionDescriptionInit }) => {
        const pc = pcRef.current;
        if (!pc) return;
        await pc.setRemoteDescription(payload.sdp);
      });

      socket.on('signal:ice', async (payload: { roomId: string; fromSocketId: string; candidate: RTCIceCandidateInit }) => {
        const pc = pcRef.current;
        if (!pc) return;
        if (!payload.candidate) return;
        try {
          await pc.addIceCandidate(payload.candidate);
        } catch {
          // ignore
        }
      });

      socket.on('room:peer-left', () => {
        cleanup();
      });

      // Join
      if (props.mode === 'candidate') {
        socket.emit('room:join', { candidateToken: props.candidateToken });
      } else {
        socket.emit('room:join', { assignmentId: props.assignmentId });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
      setStatus('error');
    }
  }, [acquireMedia, cleanup, ensurePeerConnection, props]);

  const requestCameraAndMic = useCallback(async () => {
    setPermissionHelp(null);
    setError(null);
    setMediaWarning(null);

    try {
      const result = await acquireMedia({ allowFallbacks: true });
      setLocalStream(result.stream);
      if (result.warning) setMediaWarning(result.warning);
      setPermissionDialogOpen(false);
    } catch (e) {
      setPermissionHelp(friendlyMediaError(e));
    }
  }, [acquireMedia]);

  const enableAndJoin = useCallback(async () => {
    await requestCameraAndMic();
    await startWithOptions({});
  }, [requestCameraAndMic, startWithOptions]);

  const joinWithoutMedia = useCallback(async () => {
    setLocalStream(null);
    setPermissionDialogOpen(false);
    await startWithOptions({ forceNoMedia: true });
  }, [startWithOptions]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const toggleMute = () => {
    const stream = localVideoRef.current?.srcObject;
    if (!(stream instanceof MediaStream)) return;
    if (!stream.getAudioTracks().length) return;
    for (const t of stream.getAudioTracks()) t.enabled = muted;
    setMuted((m) => !m);
  };

  const toggleCamera = () => {
    const stream = localVideoRef.current?.srcObject;
    if (!(stream instanceof MediaStream)) return;
    if (!stream.getVideoTracks().length) return;
    for (const t of stream.getVideoTracks()) t.enabled = cameraOff;
    setCameraOff((v) => !v);
  };

  return (
    <div className="grid gap-4">
      <Dialog
        open={permissionDialogOpen && status === 'idle'}
        onOpenChange={setPermissionDialogOpen}
        title="Enable camera & microphone"
      >
        <div className="grid gap-3">
          <div className="text-sm text-zinc-300">
            To do an in-app interview, the browser needs permission to use your camera and microphone.
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-sm text-zinc-400">
            - Click <span className="text-zinc-200">Enable & join</span> to trigger the browser permission popup.
            <br />
            - If you previously blocked it, click the camera icon in the address bar and allow access.
          </div>

          {permissionHelp ? <div className="text-sm text-amber-200">{permissionHelp}</div> : null}

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setPermissionDialogOpen(false)}>
              Not now
            </Button>
            <Button type="button" variant="secondary" onClick={joinWithoutMedia}>
              Join without media
            </Button>
            <Button type="button" variant="primary" onClick={enableAndJoin}>
              Enable & join
            </Button>
          </div>
        </div>
      </Dialog>

      <Card>
        <h3 className="text-sm font-medium text-zinc-300 mb-2">Video call</h3>
        <div className="text-sm text-zinc-500 mb-2">
          Status: {status === 'idle' ? 'Not started' : status === 'connecting' ? 'Connecting\u2026' : status === 'in-call' ? 'In call' : status === 'ended' ? 'Ended' : 'Error'}
        </div>
        {error ? <div className="text-sm text-red-300 mb-2">{error}</div> : null}
        {mediaWarning ? <div className="text-sm text-amber-200 mb-2">{mediaWarning}</div> : null}

        <div className="flex flex-wrap gap-2">
          {status === 'idle' || status === 'ended' || status === 'error' ? (
            <Button onClick={() => startWithOptions({})} variant="secondary" type="button">
              Start / Join
            </Button>
          ) : (
            <Button onClick={cleanup} variant="secondary" type="button">
              Leave
            </Button>
          )}

          {status === 'idle' ? (
            <Button onClick={() => setPermissionDialogOpen(true)} variant="ghost" type="button">
              Enable camera/mic
            </Button>
          ) : null}

          <Button onClick={toggleMute} variant="ghost" type="button" disabled={!hasAudioTrack}>
            {muted ? 'Unmute' : 'Mute'}
          </Button>
          <Button onClick={toggleCamera} variant="ghost" type="button" disabled={!hasVideoTrack}>
            {cameraOff ? 'Camera on' : 'Camera off'}
          </Button>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <div className="mb-2 text-sm text-zinc-400">You</div>
          <video ref={localVideoRef} autoPlay playsInline muted className="aspect-video w-full rounded-lg bg-black" />
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <div className="mb-2 text-sm text-zinc-400">Other side</div>
          <video ref={remoteVideoRef} autoPlay playsInline className="aspect-video w-full rounded-lg bg-black" />
        </div>
      </div>
    </div>
  );
}