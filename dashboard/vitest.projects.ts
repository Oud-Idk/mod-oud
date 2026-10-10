import path from "path";
import { configDefaults } from "vitest/config";

const alias = {
    "@": path.resolve(__dirname, "./src"),
};

// A crashed or killed Stryker run leaves instrumented copies of src/
// behind, and they match the default *.test.ts glob.
export const sharedExclude = [...configDefaults.exclude, ".stryker-tmp/**", "reports/**"];

// Mocked and hermetic: no Docker, no Postgres, runs as part of the inner loop.
export const unitProject = {
    test: {
        name: "unit",
        alias,
        include: ["src/**/*.test.{ts,tsx}"],
        exclude: [...sharedExclude, "**/*.integration.test.{ts,tsx}"],
    },
};

// Real Postgres, against a throwaway database built from ../migrations. Kept out
// of `unit` so the common case stays fast, and out of the Stryker config so a
// mutation run never needs a database.
export const dbProject = {
    test: {
        name: "db",
        alias,
        include: ["src/**/*.integration.test.{ts,tsx}"],
        exclude: sharedExclude,
        globalSetup: ["./src/test/globalSetup.ts"],
        setupFiles: ["./src/test/setup.ts"],
        // Each worker clones its own database, so files stay parallel.
        fileParallelism: true,
        // Cloning from a template takes a lock on it, so workers serialize briefly.
        hookTimeout: 60_000,
        testTimeout: 30_000,
        // next-auth's ESM build imports `next/server` without an extension,
        // which Node's ESM resolver rejects. Letting Vite process it fixes that.
        server: { deps: { inline: ["next-auth"] } },
    },
};