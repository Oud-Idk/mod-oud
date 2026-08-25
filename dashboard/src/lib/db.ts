import { Pool } from "pg";

declare global {
    // noinspection ES6ConvertVarToLetConst
    var pgPool: Pool | undefined;
}

// Fall back to a dummy URL during build-time page analysis
const connectionString =
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/placeholder";

const db = globalThis.pgPool ?? new Pool({ connectionString });

if (process.env.NODE_ENV !== "production") {
    globalThis.pgPool = db;
}

export { db };