import { PrismaClient } from "./generated/prisma/index.js";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Add it to your .env (e.g. in apps/backend-server/.env or the app root)."
  );
}

const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 10_000,
});

const adapter = new PrismaPg(pool);

// Create a single PrismaClient instance for the whole app.
// In Bun/Node server environments this is usually safe to keep as a singleton.
export const prisma = new PrismaClient({ adapter });

export default prisma;