import { cookies } from 'next/headers';

export const ACCESS_COOKIE = 'rozga_access';
export const REFRESH_COOKIE = 'rozga_refresh';

export async function getAccessToken() {
  const c = await cookies();
  return c.get(ACCESS_COOKIE)?.value;
}

export async function getRefreshToken() {
  const c = await cookies();
  return c.get(REFRESH_COOKIE)?.value;
}
