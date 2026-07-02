import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Litch app schema (Drizzle) on the SAME CockroachDB that Better Auth uses.
 * Better Auth manages user/session/account/verification via its own CLI
 * migration; tables here reference that auth `user.id` by TEXT id (no hard FK,
 * to avoid touching Better Auth's tables).
 *
 * This file grows per phase:
 *   Phase 2 → blog_post   Phase 3 → template   Phase 4 → booking, inquiry
 *   Phase 5 → document
 */

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

/**
 * CRM leads captured across the site: newsletter signups, email-gated
 * calculator results, template downloads, and contact/booking enquiries.
 * Serves the client's stated need for content-marketing / lead capture.
 */
export const lead = pgTable("lead", {
  id: id(),
  email: text("email").notNull(),
  name: text("name"),
  // newsletter | calculator | template | contact | booking
  source: text("source").notNull().default("newsletter"),
  detail: text("detail"), // e.g. which calculator or template
  createdAt: createdAt(),
});
