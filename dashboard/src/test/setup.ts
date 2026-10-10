import { beforeEach, vi } from "vitest";
import {
    TEMPLATE_DB,
    assertConnectedToTestDatabase,
    createDatabaseFromTemplate,
    resetDatabase,
    testDatabaseUrl,
    workerDatabaseName,
} from "./database";

// Redis is a separate dependency and not what these tests are about. Stubbing it
// here keeps a db-only run from needing a Redis server.
vi.mock("@/lib/redis", () => ({
    default: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue("OK"),
        del: vi.fn().mockResolvedValue(0),
        publish: vi.fn().mockResolvedValue(0),
        getOrSetJSON: vi.fn().mockResolvedValue(null),
    },
}));

// This runs at module scope, not in an exported function. Vitest guarantees the
// setup module body finishes before the test file is imported, and `lib/db.ts`
// builds its pool at import time, so anything deferred would be too late.
const workerId = process.env.VITEST_POOL_ID ?? process.env.VITEST_WORKER_ID ?? "0";
const workerDatabase = workerDatabaseName(workerId);

// One database per worker rather than per test file: `lib/db.ts` memoizes its
// pool on globalThis, so a file that switched databases would be served by the
// first file's pool. Truncation in beforeEach still gives every test a clean slate.
await createDatabaseFromTemplate(workerDatabase, TEMPLATE_DB);

process.env.DATABASE_URL = testDatabaseUrl(workerDatabase);

// Verify the app's own pool points at the worker database before a test can reach
// it, so a regression here fails loudly instead of quietly writing to real data.
const { db } = await import("@/lib/db");
await assertConnectedToTestDatabase(db);

beforeEach(async () => {
    await resetDatabase();
});