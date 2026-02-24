import { env } from './env';
import { getAccessToken } from './session';

type FetchOptions = Omit<RequestInit, 'headers'> & {
  headers?: Record<string, string | undefined>;
};

export async function apiFetch(path: string, options: FetchOptions = {}) {
  const { ROZGA_API_BASE_URL } = env();
  const accessToken = await getAccessToken();

  const res = await fetch(`${ROZGA_API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    } as Record<string, string>,
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
  }

  return res;
}
