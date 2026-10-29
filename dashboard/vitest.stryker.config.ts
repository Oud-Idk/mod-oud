import { defineConfig } from "vitest/config";
import { unitProject, dbProject } from "./vitest.projects";

// Both projects, deliberately. The db project needs a reachable migrations folder
// and a live Postgres; the harness finds the former by walking up out of the
// Stryker sandbox, and the latter comes from TEST_DATABASE_URL in the environment.
export default defineConfig({
    test: {
        projects: [unitProject, dbProject],
        server: {
            deps: {
                inline: ["next-auth"],
            },
        },
    },
});