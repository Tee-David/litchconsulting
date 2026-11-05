import type { Metadata } from "next";
import { and, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { client, requestAssignment, serviceRequest, user } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/server-user";
import { listInvitations } from "@/lib/invitations";
import { twoStepEnabledFor } from "@/lib/two-step";
import { AccessPage, type TeamRow, type InviteRow, type AssignmentRow } from "@/components/access/access-page";

export const metadata: Metadata = { title: "Team and access" };
export const dynamic = "force-dynamic";

const TERMINAL = ["completed", "cancelled", "declined", "refunded"];

/**
 * Settings → Team and access (R1.3). Inside the Settings layout (which owns
 * the page title and the admin gate): the firm team with role and two-step
 * status, invitations, and who is working on what.
 */
export default async function TeamAccessPage({ searchParams }: { searchParams: Promise<{ invite?: string; tab?: string }> }) {
  const sp = await searchParams;
  const me = await getSessionUser();

  const people = await db
    .select({ id: user.id, name: user.name, email: user.email, role: user.role, banned: user.banned, createdAt: user.createdAt })
    .from(user)
    .where(inArray(user.role, ["admin", "staff"]))
    .orderBy(user.name);
  const ids = people.map((p) => p.id);

  const [twoStep, lastSeen, invites, assigned] = await Promise.all([
    twoStepEnabledFor(ids).catch(() => new Set<string>()),
    ids.length
      ? db
          .execute<{ userId: string; at: Date; n: number }>(
            sql`SELECT "userId", max("updatedAt") AS "at", count(*)::int AS "n" FROM "session" WHERE "expiresAt" > now() AND "userId" IN (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) GROUP BY "userId"`,
          )
          .then((r) => r.rows)
          .catch(() => [])
      : Promise.resolve([] as Array<{ userId: string; at: Date; n: number }>),
    listInvitations(200).catch(() => []),
    ids.length
      ? db
          .select({
            userId: requestAssignment.userId,
            requestId: serviceRequest.id,
            number: serviceRequest.number,
            service: serviceRequest.serviceName,
            status: serviceRequest.status,
            updatedAt: serviceRequest.updatedAt,
            company: client.company,
            clientName: client.name,
          })
          .from(requestAssignment)
          .innerJoin(serviceRequest, eq(serviceRequest.id, requestAssignment.requestId))
          .leftJoin(client, eq(client.id, serviceRequest.clientId))
          .where(and(inArray(requestAssignment.userId, ids), isNull(serviceRequest.deletedAt), notInArray(serviceRequest.status, TERMINAL)))
          .orderBy(desc(serviceRequest.updatedAt))
          .catch(() => [])
      : Promise.resolve([]),
  ]);

  const seen = new Map(lastSeen.map((r) => [r.userId, r]));
  const team: TeamRow[] = people.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    role: p.role === "admin" ? "admin" : "staff",
    banned: Boolean(p.banned),
    twoStep: twoStep.has(p.id),
    lastActive: seen.get(p.id)?.at ? new Date(seen.get(p.id)!.at).toISOString() : null,
    devices: seen.get(p.id)?.n ?? 0,
    open: assigned.filter((a) => a.userId === p.id).length,
    me: p.id === me?.id,
  }));

  const inviteRows: InviteRow[] = invites
    .filter((i) => i.state !== "redeemed")
    .slice(0, 100)
    .map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      company: i.company,
      access: i.access,
      state: i.state,
      inviterName: i.inviterName,
      sentAt: (i.lastSentAt ?? i.createdAt).toISOString(),
      expiresAt: i.expiresAt.toISOString(),
    }));

  const work: AssignmentRow[] = people
    .filter((p) => p.role === "staff" || assigned.some((a) => a.userId === p.id))
    .map((p) => ({
      userId: p.id,
      name: p.name || p.email,
      role: p.role === "admin" ? "admin" : "staff",
      requests: assigned
        .filter((a) => a.userId === p.id)
        .map((a) => ({ id: a.requestId, number: a.number, service: a.service, status: a.status, client: a.company || a.clientName || "Client", updatedAt: a.updatedAt.toISOString() })),
    }));

  const [{ n: unassigned } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(serviceRequest)
    .where(
      and(
        isNull(serviceRequest.deletedAt),
        notInArray(serviceRequest.status, TERMINAL),
        sql`NOT EXISTS (SELECT 1 FROM ${requestAssignment} WHERE ${requestAssignment.requestId} = ${serviceRequest.id})`,
      ),
    )
    .catch(() => [{ n: 0 }]);

  return <AccessPage team={team} invites={inviteRows} work={work} unassigned={unassigned} openInvite={sp.invite === "1"} tab={sp.tab === "assign" ? "assign" : "team"} />;
}
