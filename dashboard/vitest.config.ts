import { configDefaults, defineConfig } from "vitest/config";
import path from "path";

const alias = {
    "@": path.resolve(__dirname, "./src"),
};

const shared = {
    // A crashed or killed Stryker run leaves instrumented copies of src/
    // behind, and they match the default *.test.ts glob.
    exclude: [...configDefaults.exclude, ".stryker-tmp/**", "reports/**"],
};

export default defineConfig({
    resolve: { alias },
    test: {
        projects: [
            {
                test: {
                    name: "unit",
                    alias,
                    include: ["src/**/*.test.{ts,tsx}"],
                    exclude: [...shared.exclude, "**/*.integration.test.{ts,tsx}"],
                },
            },
            {
                test: {
                    name: "db",
                    alias,
                    include: ["src/**/*.integration.test.{ts,tsx}"],
                    exclude: shared.exclude,
                    globalSetup: ["./src/test/globalSetup.ts"],
                    setupFiles: ["./src/test/setup.ts"],
                    // next-auth's ESM build imports `next/server` without an extension,
                    // which Node's ESM resolver rejects. Letting Vite process it fixes that.
                    server: { deps: { inline: ["next-auth"] } },
                    // Each worker clones its own database, so files stay parallel.
                    fileParallelism: true,
                    // Cloning from a template takes a lock on it, so workers serialize briefly.
                    hookTimeout: 60_000,
                    testTimeout: 30_000,
                },
            },
        ],
    },
});