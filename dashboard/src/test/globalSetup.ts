import { Client } from "pg";
import {
    TEMPLATE_DB,
    applyMigrations,
    createDatabase,
    dropDatabaseIfExists,
    dropStaleWorkerDatabases,
    testDatabaseUrl,
} from "./database";

// Rebuilt from scratch every run. Several migrations create indexes and enum types
// without IF NOT EXISTS, so re-applying them onto a populated database fails.
export default async function globalSetup(): Promise<void> {
    const dropped = await dropStaleWorkerDatabases();
    await dropDatabaseIfExists(TEMPLATE_DB);
    await createDatabase(TEMPLATE_DB);

    const client = new Client({ connectionString: testDatabaseUrl(TEMPLATE_DB) });
    await client.connect();
    try {
        const count = await applyMigrations(client);
        process.stdout.write(
            `[db] applied ${String(count)} migrations to ${TEMPLATE_DB}, cleared ${String(dropped.length)} worker database(s)\n`
        );
    } finally {
        await client.end();
    }
}