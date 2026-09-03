/** Dealer access roles, stored per user in the `profiles` table. */
export type Role = "technician" | "senior" | "admin";

export const ROLE_ORDER: Role[] = ["technician", "senior", "admin"];

export const ROLE_LABEL: Record<Role, string> = {
  technician: "Technician",
  senior: "Senior technician",
  admin: "Workshop admin",
};

/** Vehicle-touching actions that need more than read access. */
export type GuardedAction =
  "read" | "clear-dtc" | "io-control" | "routine" | "write-did" | "programming";

const REQUIRED: Record<GuardedAction, Role> = {
  read: "technician",
  "clear-dtc": "senior",
  "io-control": "senior",
  routine: "senior",
  "write-did": "admin",
  programming: "admin",
};

export const requiredRole = (action: GuardedAction): Role => REQUIRED[action];

export const rank = (role: Role): number => ROLE_ORDER.indexOf(role);

export const canPerform = (role: Role, action: GuardedAction): boolean =>
  rank(role) >= rank(REQUIRED[action]);

export const roleTooltip = (action: GuardedAction): string =>
  `Requires the ${ROLE_LABEL[REQUIRED[action]]} role or higher.`;
