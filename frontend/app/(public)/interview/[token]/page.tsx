import { env } from '../../../lib/env';
import { Card } from '../../../ui/card';
import { VideoInterviewRoomClient } from '../../../ui/webrtc/video-interview-room-client';
import { ResumeUpload } from './_resume-upload';

export default async function CandidateInterviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { ROZGA_API_BASE_URL } = env();
  const apiOrigin = new URL(ROZGA_API_BASE_URL).origin;

  const res = await fetch(`${ROZGA_API_BASE_URL}/api/v1/public/interview-rooms/${encodeURIComponent(token)}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return (
      <Card>
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Interview link not valid</h3>
        <p className="text-sm text-zinc-500">{text || 'This link may have expired. Please contact HR.'}</p>
      </Card>
    );
  }

  const info = (await res.json()) as {
    roomId: string;
    assignmentId: string;
    mode: 'ONLINE' | 'OFFLINE';
    scheduledAt?: string | null;
    candidate?: { id: string; fullName: string; resumeUrl?: string | null };
    batch?: { id: string; name: string };
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xl font-semibold text-zinc-100">Online Interview</div>
        <div className="text-sm text-zinc-500">
          {info.batch?.name ? `Batch: ${info.batch.name}` : 'Please keep your camera and mic ready.'}
        </div>
      </div>

      <Card>
        <h3 className="text-sm font-medium text-zinc-300 mb-3">{info.candidate?.fullName ? `Hi, ${info.candidate.fullName}` : 'Join the call'}</h3>
        <p className="text-sm text-zinc-500">
          {info.scheduledAt ? `Scheduled: ${new Date(info.scheduledAt).toLocaleDateString()}` : 'Waiting for interviewer'}
        </p>
      </Card>

      <ResumeUpload token={token} apiOrigin={apiOrigin} existingResumeUrl={info.candidate?.resumeUrl ?? null} />

      <VideoInterviewRoomClient mode="candidate" candidateToken={token} apiOrigin={apiOrigin} />
    </div>
  );
}
