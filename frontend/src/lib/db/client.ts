import { drizzle } from "drizzle-orm/node-postgres";
import { pool } from "./pg-pool";
import * as schema from "./schema";

/**
 * Drizzle client on the shared CockroachDB pool (see `pg-pool.ts`) — the same
 * pool Better Auth uses, with the pinned CA cert and fail-fast timeouts.
 */
export const db = drizzle(pool, { schema });
export { schema };
