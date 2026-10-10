import { defineConfig } from "vitest/config";
import { unitProject } from "./vitest.projects";

// Stryker runs the suite inside .stryker-tmp/sandbox-*/, which holds a copy of the
// dashboard but not ../migrations. The db project's globalSetup would look for
// migrations there, fail, and crash the runner before a single mutant is tried.
// Mutation testing here measures the mocked suite, so it gets the unit project only.
export default defineConfig({
    test: {
        projects: [unitProject],
    },
});