import { defineConfig } from "vitest/config";
import { unitProject, dbProject } from "./vitest.projects";

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