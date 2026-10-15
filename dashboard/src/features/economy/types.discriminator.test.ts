import { describe, expect, it } from "vitest";

// Dynamic import keeps schema construction inside the test, so a broken union
// fails the test instead of the whole file at collection time.
async function loadTypes(): Promise<typeof import("./types")> {
    return import("./types");
}

describe("itemRequirementSchema discriminator", () => {
    it("should route each type value to its own variant", async () => {
        const { itemRequirementSchema } = await loadTypes();

        expect(itemRequirementSchema.parse({ type: "ROLE" })).toEqual({
            type: "ROLE",
            matchType: "EVERY",
            triggerFlags: 1,
            roleIds: [],
        });
        expect(itemRequirementSchema.parse({ type: "TOTAL_BALANCE" })).toEqual({
            type: "TOTAL_BALANCE",
            triggerFlags: 1,
            balance: 0,
        });
        expect(itemRequirementSchema.parse({ type: "ITEM" })).toEqual({
            type: "ITEM",
            matchType: "EVERY",
            triggerFlags: 1,
            quantities: {},
        });
    });

    it("should reject unknown and missing discriminator values", async () => {
        const { itemRequirementSchema } = await loadTypes();

        expect(itemRequirementSchema.safeParse({ type: "LEVEL" }).success).toBe(false);
        expect(itemRequirementSchema.safeParse({}).success).toBe(false);
    });

    it("should reject mistyped fields on every variant", async () => {
        const { itemRequirementSchema } = await loadTypes();

        expect(itemRequirementSchema.safeParse({ type: "ROLE", roleIds: "role_a" }).success).toBe(
            false
        );
        expect(
            itemRequirementSchema.safeParse({ type: "TOTAL_BALANCE", balance: 10.5 }).success
        ).toBe(false);
        expect(
            itemRequirementSchema.safeParse({ type: "ITEM", quantities: { sword: 1.5 } }).success
        ).toBe(false);
    });
});

describe("itemActionSchema discriminator", () => {
    it("should route each type value to its own variant", async () => {
        const { itemActionSchema } = await loadTypes();

        expect(itemActionSchema.parse({ type: "RESPOND" })).toEqual({
            type: "RESPOND",
            triggerFlags: 1,
            message: {
                enabled: true,
                format: "TEXT",
                content: "",
                embed: {},
            },
        });
        expect(itemActionSchema.parse({ type: "ADD_ROLES" })).toEqual({
            type: "ADD_ROLES",
            triggerFlags: 1,
            roleIds: [],
        });
        expect(itemActionSchema.parse({ type: "REMOVE_ROLES" })).toEqual({
            type: "REMOVE_ROLES",
            triggerFlags: 1,
            roleIds: [],
        });
        expect(itemActionSchema.parse({ type: "ADD_BALANCE" })).toEqual({
            type: "ADD_BALANCE",
            triggerFlags: 1,
            balance: 0,
        });
        expect(itemActionSchema.parse({ type: "REMOVE_BALANCE" })).toEqual({
            type: "REMOVE_BALANCE",
            triggerFlags: 1,
            balance: 0,
        });
        expect(itemActionSchema.parse({ type: "ADD_ITEMS" })).toEqual({
            type: "ADD_ITEMS",
            triggerFlags: 1,
            quantities: {},
            itemIds: [],
        });
        expect(itemActionSchema.parse({ type: "REMOVE_ITEMS" })).toEqual({
            type: "REMOVE_ITEMS",
            triggerFlags: 1,
            quantities: {},
            itemIds: [],
        });
    });

    it("should reject unknown and missing discriminator values", async () => {
        const { itemActionSchema } = await loadTypes();

        expect(itemActionSchema.safeParse({ type: "TELEPORT" }).success).toBe(false);
        expect(itemActionSchema.safeParse({}).success).toBe(false);
    });

    it("should reject mistyped fields on variants with and without unions", async () => {
        const { itemActionSchema } = await loadTypes();

        expect(itemActionSchema.safeParse({ type: "ADD_ROLES", roleIds: "role_a" }).success).toBe(
            false
        );
        expect(itemActionSchema.safeParse({ type: "ADD_BALANCE", balance: 1.5 }).success).toBe(
            false
        );
        expect(
            itemActionSchema.safeParse({ type: "ADD_ITEMS", quantities: { sword: 1.5 } }).success
        ).toBe(false);
    });
});
