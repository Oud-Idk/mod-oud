import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

// Migrations are owned by the Rust bot and applied by sqlx at startup, so the
// dashboard has no schema of its own to apply. Reading the same files is what
// makes an integration test catch a query that no longer matches the real schema.
//
// Resolved by walking up rather than by a fixed relative path, because Stryker
// runs the suite from .stryker-tmp/sandbox-*/src/test and copies only the
// dashboard, which puts ../../../migrations somewhere that does not exist.
const MIGRATIONS_DIR = resolveMigrationsDir();

function resolveMigrationsDir(): string {
    const override = process.env.MIGRATIONS_DIR;
    if (override !== undefined && override !== "") return override;

    let dir = import.meta.dirname;
    for (let depth = 0; depth < 8; depth++) {
        const candidate = path.join(dir, "migrations");
        if (existsSync(candidate) && readdirSync(candidate).some((f) => f.endsWith(".sql"))) {
            return candidate;
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }

    throw new Error(
        "Could not find a migrations directory above this file. Set MIGRATIONS_DIR to the Rust bot's migrations folder."
    );
}

const SAFE_DB_NAME_PREFIX = "mod_oud_test";

function quoteIdent(name: string): string {
    return `"${name.replaceAll('"', '""')}"`;
}

export function assertSafeDatabaseName(name: string): void {
    if (!name.startsWith(SAFE_DB_NAME_PREFIX)) {
        throw new Error(`Refusing to touch database "${name}": test databases must start with ${SAFE_DB_NAME_PREFIX}`);
    }
}

function urlForDatabase(baseUrl: string, database: string): string {
    const url = new URL(baseUrl);
    url.pathname = `/${database}`;
    return url.toString();
}

function baseConnectionString(): string {
    const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? localEnvValue("DATABASE_URL");
    if (url === undefined || url === "") {
        throw new Error("Set DATABASE_URL or TEST_DATABASE_URL to run the db test project");
    }
    return url;
}

function localEnvValue(key: string): string | undefined {
    return readLocalEnvFile()[key];
}

// Next.js loads .env.local for the app, but Vitest runs outside that pipeline.
// Parsed by hand rather than via process.loadEnvFile: globalSetup runs in Vitest's
// main process and worker forks inherit its env, so loading the file into
// process.env there would leak INTERNAL_API_SECRET and friends into every
// unrelated test.
function readLocalEnvFile(): Record<string, string> {
    const envFile = path.resolve(import.meta.dirname, "../../.env.local");
    if (!existsSync(envFile)) return {};

    const values: Record<string, string> = {};
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
        const trimmed = line.trim();
        if (trimmed === "" || trimmed.startsWith("#")) continue;

        const separator = trimmed.indexOf("=");
        if (separator === -1) continue;

        const key = trimmed.slice(0, separator).trim();
        let value = trimmed.slice(separator + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        values[key] = value;
    }
    return values;
}

export function testDatabaseUrl(database: string): string {
    assertSafeDatabaseName(database);
    return urlForDatabase(baseConnectionString(), database);
}

// CREATE DATABASE cannot run inside a transaction block, so every statement goes
// through a maintenance connection to `postgres` rather than a pool.
async function withMaintenanceClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
    const client = new Client({ connectionString: urlForDatabase(baseConnectionString(), "postgres") });
    await client.connect();
    try {
        return await fn(client);
    } finally {
        await client.end();
    }
}

export async function applyMigrations(client: Client): Promise<number> {
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();

    for (const file of files) {
        const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
        // No `values`, so node-postgres uses the simple query protocol and sends the
        // file as one batch. A migration that carries its own BEGIN/COMMIT still works.
        await client.query(sql);
    }

    return files.length;
}

export async function dropDatabaseIfExists(database: string): Promise<void> {
    assertSafeDatabaseName(database);
    await withMaintenanceClient(async (client) => {
        // FORCE drops connections left behind by a killed run.
        await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(database)} WITH (FORCE)`);
    });
}

// Stryker starts one test runner per worker and each runs globalSetup at the same
// time. Sharing one template between them races: they fight over CREATE DATABASE,
// and a runner that loses would clone from a template that is still migrating.
// Every database is therefore named after the pid of the process that owns it, so
// concurrent invocations never touch the same one.
export function templateDatabaseName(runId: string): string {
    return `mod_oud_test_t${runId}`;
}

export function workerDatabaseName(runId: string, workerId: string): string {
    return `mod_oud_test_w${workerId}_${runId}`;
}

function runIdOf(database: string): string | undefined {
    const match = /^mod_oud_test_(?:t|w\d+_)(.+)$/.exec(database);
    return match?.[1];
}

function isProcessAlive(pid: string): boolean {
    try {
        process.kill(Number(pid), 0);
        return true;
    } catch {
        return false;
    }
}

// Databases whose owning process is gone come from a crashed or killed run.
export async function dropAbandonedDatabases(): Promise<string[]> {
    return withMaintenanceClient(async (client) => {
        const { rows } = await client.query<{ datname: string }>(
            "SELECT datname FROM pg_database WHERE datname LIKE $1",
            [`${SAFE_DB_NAME_PREFIX}%`]
        );

        const dropped: string[] = [];
        for (const row of rows) {
            assertSafeDatabaseName(row.datname);
            const runId = runIdOf(row.datname);
            if (runId !== undefined && isProcessAlive(runId)) continue;
            await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(row.datname)} WITH (FORCE)`);
            dropped.push(row.datname);
        }
        return dropped;
    });
}

export async function dropRunDatabases(runId: string): Promise<string[]> {
    return withMaintenanceClient(async (client) => {
        const { rows } = await client.query<{ datname: string }>(
            "SELECT datname FROM pg_database WHERE datname LIKE $1",
            [`${SAFE_DB_NAME_PREFIX}%`]
        );

        const dropped: string[] = [];
        for (const row of rows) {
            assertSafeDatabaseName(row.datname);
            if (runIdOf(row.datname) !== runId) continue;
            await client.query(`DROP DATABASE IF EXISTS ${quoteIdent(row.datname)} WITH (FORCE)`);
            dropped.push(row.datname);
        }
        return dropped;
    });
}

export async function createDatabase(database: string, template?: string): Promise<void> {
    assertSafeDatabaseName(database);
    await withMaintenanceClient(async (client) => {
        const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
        if (exists.rowCount !== 0) return;
        const source = template !== undefined ? `TEMPLATE ${quoteIdent(template)}` : "";
        await client.query(`CREATE DATABASE ${quoteIdent(database)} ${source}`.trim());
    });
}

export async function createDatabaseFromTemplate(database: string, template: string): Promise<void> {
    await createDatabase(database, template);
}

declare module "vitest" {
    interface ProvidedContext {
        runId: string;
        templateDatabase: string;
    }
}

interface Queryable {
    query(sql: string): Promise<{ rows: { current_database: string }[] }>;
}

// Last line of defence. `lib/db.ts` builds its pool at module load from
// DATABASE_URL, so a load-order slip would otherwise aim every test at the
// developer's own database.
export async function assertConnectedToTestDatabase(pool: Queryable): Promise<void> {
    const { rows } = await pool.query("SELECT current_database()");
    assertSafeDatabaseName(rows[0].current_database);
}

// A fresh database per test is far too slow for 38 migrations. Truncating in one
// statement keeps isolation cheap and needs no per-feature table list to maintain.
export async function resetDatabase(): Promise<void> {
    // Imported lazily: a static import here would evaluate `lib/db.ts` before the
    // setup file repoints DATABASE_URL at the worker database.
    const { db } = await import("@/lib/db");

    await assertConnectedToTestDatabase(db);

    const { rows } = await db.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
    );
    if (rows.length === 0) return;

    const tables = rows.map((row) => quoteIdent(row.table_name)).join(", ");
    await db.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}