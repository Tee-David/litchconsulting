/**
 * Roles and access — the single source of truth.
 *
 * The server enforces this map (`requireArea`, `canAccess`) and Settings →
 * Access renders the very same map, so what the table says is what the code
 * does. Isomorphic (no server-only imports): client components may read it to
 * hide controls, but hiding is cosmetic — every action re-checks on the server.
 *
 *   admin  — owners. Everything.
 *   staff  — team members. Only requests assigned to them; never money
 *            amounts, finance, settings, users, trash/purge or audit.
 *   client — their own requests, quotes, invoices, files and support.
 */

export const ROLES = ["admin", "staff", "client"] as const;
export type Role = (typeof ROLES)[number];

export const isRole = (r: unknown): r is Role => typeof r === "string" && (ROLES as readonly string[]).includes(r);

/** Normalise whatever is stored on the user row; unknown values are clients. */
export function roleOf(user: { role?: string | null } | null | undefined): Role {
  return isRole(user?.role) ? user!.role as Role : "client";
}

export const AREAS = {
  // Firm workspace
  home: "Home and work queue",
  requests: "Requests (assigned only for staff)",
  requestsAll: "All requests, assignment",
  clients: "Clients",
  clientData: "Client data export and erase (NDPA)",
  billing: "Quotes, invoices, payments and expenses",
  money: "Money amounts on requests",
  analyses: "Analyses workbench",
  sage: "Sage assistant",
  helpDesk: "Help desk",
  content: "Website content (blog, services, templates)",
  reports: "Reports",
  trash: "Trash and purge",
  audit: "Audit log",
  settings: "Firm settings and integrations",
  access: "Team, roles and invitations",
  // Client portal
  portal: "Client portal",
} as const;
export type Area = keyof typeof AREAS;

const MATRIX: Record<Role, ReadonlySet<Area>> = {
  admin: new Set<Area>([
    "home", "requests", "requestsAll", "clients", "clientData", "billing", "money",
    "analyses", "sage", "helpDesk", "content", "reports", "trash", "audit",
    "settings", "access",
  ]),
  staff: new Set<Area>(["home", "requests", "analyses", "sage", "helpDesk"]),
  client: new Set<Area>(["portal"]),
};

export function canAccess(role: Role, area: Area): boolean {
  return MATRIX[role].has(area);
}

/** Rows for the Settings → Access table (role × area). */
export function accessMatrix(): Array<{ area: Area; label: string; admin: boolean; staff: boolean; client: boolean }> {
  return (Object.keys(AREAS) as Area[]).map((area) => ({
    area,
    label: AREAS[area],
    admin: MATRIX.admin.has(area),
    staff: MATRIX.staff.has(area),
    client: MATRIX.client.has(area),
  }));
}

/** Where each role lands after sign-in. */
export function homeFor(role: Role): string {
  return role === "admin" ? "/admin" : role === "staff" ? "/work" : "/dashboard";
}

export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", staff: "Staff", client: "Client" };
