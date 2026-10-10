import { configDefaults, defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    test: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
        // A crashed or killed Stryker run leaves instrumented copies of src/
        // behind, and they match the default *.test.ts glob.
        exclude: [...configDefaults.exclude, ".stryker-tmp/**", "reports/**"],
    },
});