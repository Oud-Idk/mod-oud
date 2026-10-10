import { Client } from "pg";
import {
    applyMigrations,
    createDatabase,
    dropAbandonedDatabases,
    dropRunDatabases,
    templateDatabaseName,
    testDatabaseUrl,
} from "./database";

interface SetupContext {
    provide: (key: "runId" | "templateDatabase", value: string) => void;
}

export default async function setup({ provide }: SetupContext): Promise<() => Promise<void>> {
    // The pid keeps concurrent invocations, such as Stryker's per-worker test
    // runners, from sharing a template database.
    const runId = String(process.pid);
    const template = templateDatabaseName(runId);

    const abandoned = await dropAbandonedDatabases();
    await createDatabase(template);

    const client = new Client({ connectionString: testDatabaseUrl(template) });
    await client.connect();
    let applied: number;
    try {
        applied = await applyMigrations(client);
    } finally {
        await client.end();
    }

    process.stdout.write(
        `[db] applied ${String(applied)} migrations to ${template}, cleared ${String(abandoned.length)} abandoned database(s)\n`
    );

    provide("runId", runId);
    provide("templateDatabase", template);

    return async () => {
        await dropRunDatabases(runId);
    };
}