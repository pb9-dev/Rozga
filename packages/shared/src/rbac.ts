export const Roles = {
  Admin: 'Admin',
  HR: 'HR',
  Interviewer: 'Interviewer',
  Employee: 'Employee',
  Candidate: 'Candidate',
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];

export const roleRank: Record<Role, number> = {
  Admin: 100,
  HR: 80,
  Interviewer: 60,
  Employee: 40,
  Candidate: 20,
};

export const hasAnyRole = (userRoles: readonly Role[], allowed: readonly Role[]) =>
  userRoles.some((r) => allowed.includes(r));
