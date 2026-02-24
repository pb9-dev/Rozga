import type { Role } from './rbac';

export type JwtClaims = {
  sub: string;
  tenantId: string;
  roles: Role[];
  email: string;
};

export type ApiError = {
  message: string;
  code?: string;
  details?: unknown;
};

export type CampusHiringService = 'campus';

export type CampusStageKind =
  | 'GD_OFFLINE'
  | 'AI_INTERVIEW'
  | 'TECH_TEST'
  | 'TECH_ROUND_ONLINE'
  | 'TECH_ROUND_OFFLINE';
