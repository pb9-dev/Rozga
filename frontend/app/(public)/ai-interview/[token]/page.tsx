import { env } from '../../../lib/env';
import { Card } from '../../../ui/card';
import { PublicAiInterviewClient } from './_public-ai-interview-client';

export default async function PublicAiInterviewPage({ params }: { params: Promise<{ token: string }> }) {
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
        <h3 className="text-base font-semibold text-zinc-200 mb-1">Interview link not valid</h3>
        <p className="text-sm text-zinc-500">{text || 'This link may have expired. Please contact HR.'}</p>
      </Card>
    );
  }

  const info = (await res.json()) as {
    roomId: string;
    assignmentId: string;
    scheduledAt?: string | null;
    candidate?: { id: string; fullName: string; resumeUrl?: string | null };
    batch?: { id: string; name: string };
  };

  return (
    <PublicAiInterviewClient
      token={token}
      apiOrigin={apiOrigin}
      candidateName={info.candidate?.fullName ?? null}
      batchName={info.batch?.name ?? null}
      scheduledAt={info.scheduledAt ?? null}
      existingResumeUrl={info.candidate?.resumeUrl ?? null}
    />
  );
}
