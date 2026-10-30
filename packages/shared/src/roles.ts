export const UserRole = {
  CIDADAO: 'CIDADAO',
  GESTOR: 'GESTOR',
  ADMIN: 'ADMIN',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const USER_ROLES: readonly UserRole[] = Object.values(UserRole);

/** Municipal staff: ADMIN can do everything a GESTOR can. */
export function isStaff(role: UserRole): boolean {
  return role === UserRole.GESTOR || role === UserRole.ADMIN;
}

/** True when `role` satisfies any of the `required` roles (ADMIN inherits GESTOR). */
export function hasRole(role: UserRole, required: readonly UserRole[]): boolean {
  if (required.includes(role)) return true;
  return role === UserRole.ADMIN && required.includes(UserRole.GESTOR);
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}
