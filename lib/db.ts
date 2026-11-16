import "server-only";

import { neon } from "@neondatabase/serverless";

let database: ReturnType<typeof neon<false, false>> | null = null;

export function getDatabase() {
  if (database) return database;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  database = neon(connectionString);
  return database;
}
