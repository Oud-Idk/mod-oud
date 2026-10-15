import { describe, it, expect } from "vitest";

describe("leveling types module load", () => {
    it("should load the notification and xp target schemas", async () => {
        // Dynamic import surfaces a broken module as a test failure.
        const mod = await import("./types");

        expect(mod.notificationTargetSchema).toBeDefined();
        expect(mod.xpTargetSchema).toBeDefined();
    });
});
