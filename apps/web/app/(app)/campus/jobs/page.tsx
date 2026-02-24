import Link from 'next/link';
import { apiFetch } from '../../../lib/api';
import { Badge } from '../../../ui/badge';
import { Card } from '../../../ui/card';
import { Table, Td, Th } from '../../../ui/table';

type Job = {
  id: string;
  title: string;
  description: string;
  jdUrl?: string | null;
  updatedAt: string;
};

export default async function JobsPage() {
  const res = await apiFetch('/api/v1/campus/jobs');
  const jobs = (await res.json()) as Job[];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Jobs</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Upload or edit JDs used for AI interviews</p>
        </div>
        <Badge tone="neutral">{jobs.length}</Badge>
      </div>

      {jobs.length === 0 ? (
        <Card>
          <p className="text-sm text-zinc-500 text-center py-6">No job descriptions yet.</p>
        </Card>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Title</Th>
              <Th>JD Status</Th>
              <Th>Updated</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id}>
                <Td className="font-medium text-zinc-200">
                  <span className="truncate block max-w-[300px]">{j.title}</span>
                </Td>
                <Td>
                  {j.jdUrl ? <Badge tone="good">Uploaded</Badge> : <Badge tone="neutral">Not uploaded</Badge>}
                </Td>
                <Td className="text-zinc-500 text-xs whitespace-nowrap">{new Date(j.updatedAt).toLocaleDateString()}</Td>
                <Td className="text-right">
                  <Link className="text-sm text-indigo-400 hover:text-indigo-300" href={`/campus/jobs/${j.id}`}>
                    Edit
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
