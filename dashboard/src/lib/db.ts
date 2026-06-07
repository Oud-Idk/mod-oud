import { Pool } from "pg";

declare global {
    var pgPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error("Please define the DATABASE_URL environment variable inside .env.local");
}

const db = globalThis.pgPool ?? new Pool({ connectionString });

if (process.env.NODE_ENV !== "production") {
    globalThis.pgPool = db;
}

export { db };