import { describe, it, expect } from "vitest";

// Dynamic import, so a mutant that breaks module load fails here
// instead of hiding as a collection error in every other file.
describe("priorCopiesSchema module guard", () => {
    it("should load with a working mode discriminator", async () => {
        const mod = await import("./types");
        expect(mod.priorCopiesSchema.safeParse({ mode: "KEEP" }).success).toBe(true);
        expect(mod.priorCopiesSchema.safeParse({ mode: "DELETE", limit: 2 }).success).toBe(true);
        expect(mod.priorCopiesSchema.safeParse({}).success).toBe(false);
    });
});
