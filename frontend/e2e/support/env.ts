/**
 * E2E environment: reads frontend/.env.local (the same file `next dev` uses)
 * into process.env for the test process, without overriding anything already
 * set. Nothing here is ever printed.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

let loaded = false;

export function loadEnv() {
  if (loaded) return;
  loaded = true;
  const file = join(__dirname, "..", "..", ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v.replace(/\\n/g, "\n");
  }
}

export function need(name: string): string {
  loadEnv();
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (frontend/.env.local)`);
  return v;
}

export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3101";
