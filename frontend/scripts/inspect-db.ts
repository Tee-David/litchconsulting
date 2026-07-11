import { Pool } from "pg";

function ssl() {
  const cert = process.env.COCKROACH_CA_CERT || process.env.COCKROACHDB_CERT;
  return cert && cert.includes("BEGIN CERTIFICATE")
    ? { ca: cert, rejectUnauthorized: true as const }
    : { rejectUnauthorized: true as const };
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL || process.env.COCKROACHDB_URL, ssl: ssl() });
  
  // List all tables
  const tables = await pool.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
  `);
  console.log("Tables in DB:", tables.rows.map(r => r.table_name));

  // Get columns of the user table
  try {
    const cols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'user'
    `);
    console.log("User table columns:", cols.rows);

    const users = await pool.query(`SELECT id, email, name, role, banned FROM "user" LIMIT 5`);
    console.log("Sample users:", users.rows);
  } catch (err) {
    console.error("Error inspecting 'user' table:", err instanceof Error ? err.message : err);
  }

  await pool.end();
}

main();
