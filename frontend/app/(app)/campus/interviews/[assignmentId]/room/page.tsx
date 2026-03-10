import { apiFetch } from '../../../../../lib/api';
import { env } from '../../../../../lib/env';
import { Card } from '../../../../../ui/card';
import { VideoInterviewRoomClient } from '../../../../../ui/webrtc/video-interview-room-client';

export default async function InterviewRoomPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;
  const { ROZGA_API_BASE_URL } = env();
  const apiOrigin = new URL(ROZGA_API_BASE_URL).origin;

  const ctxRes = await apiFetch(`/api/v1/campus/interviews/assignments/${encodeURIComponent(assignmentId)}/room`);
  const ctx = (await ctxRes.json()) as {
    candidate?: { id: string; fullName: string };
    batch?: { id: string; name: string };
    scheduledAt?: string | null;
    room?: { id: string; expiresAt?: string | null; endedAt?: string | null } | null;
  };

  const hasRoom = Boolean(ctx.room?.id);

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xl font-semibold text-zinc-100">Interview room</div>
        <div className="text-sm text-zinc-500">
          {ctx.batch?.name ? `Batch: ${ctx.batch.name}` : ''}
          {ctx.scheduledAt ? ` • Scheduled: ${new Date(ctx.scheduledAt).toLocaleDateString()}` : ''}
        </div>
      </div>

      {!hasRoom ? (
        <Card>
          <h3 className="text-sm font-medium text-zinc-300 mb-1">Room not created yet</h3>
          <p className="text-sm text-zinc-500">Ask HR/Admin to generate the candidate link first.</p>
        </Card>
      ) : null}

      <VideoInterviewRoomClient mode="interviewer" assignmentId={assignmentId} apiOrigin={apiOrigin} />
    </div>
  );
}
