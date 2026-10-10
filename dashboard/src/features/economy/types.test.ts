import { describe, it, expect } from "vitest";
import {
    DEFAULT_ITEM_MESSAGE,
    economyCategorySchema,
    economyConfigSchema,
    economyItemSchema,
    economyLeaderboardEntrySchema,
    economyWorkMessageSchema,
    getLeaderboardInputSchema,
    itemActionSchema,
    itemRequirementSchema,
    matchTypeSchema,
    triggerFlagsSchema,
} from "./types";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("economyConfigSchema", () => {
    it("should apply defaults when an empty object is parsed", () => {
        const parsed = economyConfigSchema.parse({});

        expect(parsed.enabled).toBe(false);
        expect(parsed.currencyName).toBe("coins");
        expect(parsed.workCooldownSecs).toBe(3600);
        expect(parsed.workMinReward).toBe(1000);
        expect(parsed.workMaxReward).toBe(5000);
        expect(parsed.workMessage).toBe("You earned **{reward} {currency}**!");
        expect(parsed.startingBalance).toBe(0);
        expect(parsed.giftingEnabled).toBe(true);
    });

    it("should PASS a fully configured economy config", () => {
        const result = economyConfigSchema.safeParse({
            enabled: true,
            currencyName: "gems",
            workCooldownSecs: 1800,
            workMinReward: 200,
            workMaxReward: 800,
            workMessage: "Go grind",
            startingBalance: 500,
            giftingEnabled: false,
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toEqual({
                enabled: true,
                currencyName: "gems",
                workCooldownSecs: 1800,
                workMinReward: 200,
                workMaxReward: 800,
                workMessage: "Go grind",
                startingBalance: 500,
                giftingEnabled: false,
            });
        }
    });

    it("should strip unknown keys from the parsed config", () => {
        const parsed = economyConfigSchema.parse({ currencyName: "gems", legacy_field: "nope" });

        expect(parsed).not.toHaveProperty("legacy_field");
        expect(parsed.currencyName).toBe("gems");
    });

    describe("reward boundary validation", () => {
        it("should PASS when min_reward is strictly less than max_reward", () => {
            const result = economyConfigSchema.safeParse({
                workMinReward: 100,
                workMaxReward: 200,
            });
            expect(result.success).toBe(true);
        });

        it("should PASS when min_reward equals max_reward (flat payout)", () => {
            const result = economyConfigSchema.safeParse({
                workMinReward: 500,
                workMaxReward: 500,
            });
            expect(result.success).toBe(true);
        });

        it("should REJECT when min_reward is strictly greater than max_reward", () => {
            const result = economyConfigSchema.safeParse({
                workMinReward: 6000,
                workMaxReward: 5000,
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                const issue = result.error.issues[0];
                expect(issue.message).toBe(
                    "Minimum work reward must be less than or equal to maximum work reward."
                );
                expect(issue.path).toEqual(["workMaxReward"]);
            }
        });

        it("should anchor the refinement issue on workMaxReward even when min is the offending field", () => {
            const result = economyConfigSchema.safeParse({ workMinReward: 500, workMaxReward: 400 });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].path).toEqual(["workMaxReward"]);
            }
        });
    });

    describe("type & integer validation", () => {
        it("should reject non-boolean enabled value", () => {
            expect(economyConfigSchema.safeParse({ enabled: "true" }).success).toBe(false);
        });

        it("should reject non-boolean giftingEnabled value", () => {
            expect(economyConfigSchema.safeParse({ giftingEnabled: 1 }).success).toBe(false);
        });

        it("should reject non-integer cooldown values", () => {
            expect(economyConfigSchema.safeParse({ workCooldownSecs: 12.5 }).success).toBe(false);
        });

        it("should reject negative cooldown values", () => {
            expect(economyConfigSchema.safeParse({ workCooldownSecs: -1 }).success).toBe(false);
        });

        it("should reject negative reward values", () => {
            expect(economyConfigSchema.safeParse({ workMinReward: -50 }).success).toBe(false);
            expect(economyConfigSchema.safeParse({ workMaxReward: -50 }).success).toBe(false);
        });

        it("should reject negative startingBalance values", () => {
            expect(economyConfigSchema.safeParse({ startingBalance: -1 }).success).toBe(false);
        });

        it("should accept a zero cooldown and zero rewards", () => {
            const result = economyConfigSchema.safeParse({
                workCooldownSecs: 0,
                workMinReward: 0,
                workMaxReward: 0,
            });
            expect(result.success).toBe(true);
        });

        it("should accept an empty currencyName string", () => {
            expect(economyConfigSchema.safeParse({ currencyName: "" }).success).toBe(true);
        });
    });
});

describe("matchTypeSchema", () => {
    it.each(["EVERY", "AT_LEAST_ONE", "NONE"])("should accept %s", (value) => {
        expect(matchTypeSchema.parse(value)).toBe(value);
    });

    it("should reject an unknown match type", () => {
        expect(matchTypeSchema.safeParse("SOME").success).toBe(false);
    });

    it("should reject a wrong-cased match type", () => {
        expect(matchTypeSchema.safeParse("every").success).toBe(false);
    });
});

describe("triggerFlagsSchema", () => {
    it("should default to 1", () => {
        expect(triggerFlagsSchema.parse(undefined)).toBe(1);
    });

    it("should accept any integer", () => {
        expect(triggerFlagsSchema.parse(0)).toBe(0);
        expect(triggerFlagsSchema.parse(4)).toBe(4);
    });

    it("should reject non-integer flags", () => {
        expect(triggerFlagsSchema.safeParse(1.5).success).toBe(false);
    });

    it("should reject non-numeric flags", () => {
        expect(triggerFlagsSchema.safeParse("1").success).toBe(false);
    });
});

describe("itemRequirementSchema", () => {
    it("should apply ROLE defaults", () => {
        expect(itemRequirementSchema.parse({ type: "ROLE" })).toEqual({
            type: "ROLE",
            matchType: "EVERY",
            triggerFlags: 1,
            roleIds: [],
        });
    });

    it("should keep every provided ROLE field", () => {
        expect(
            itemRequirementSchema.parse({
                type: "ROLE",
                matchType: "AT_LEAST_ONE",
                triggerFlags: 2,
                roleIds: ["role_a", "role_b"],
            })
        ).toEqual({
            type: "ROLE",
            matchType: "AT_LEAST_ONE",
            triggerFlags: 2,
            roleIds: ["role_a", "role_b"],
        });
    });

    it("should apply TOTAL_BALANCE defaults", () => {
        expect(itemRequirementSchema.parse({ type: "TOTAL_BALANCE" })).toEqual({
            type: "TOTAL_BALANCE",
            triggerFlags: 1,
            balance: 0,
        });
    });

    it("should keep a provided TOTAL_BALANCE threshold", () => {
        expect(itemRequirementSchema.parse({ type: "TOTAL_BALANCE", balance: 10000, triggerFlags: 4 })).toEqual(
            {
                type: "TOTAL_BALANCE",
                triggerFlags: 4,
                balance: 10000,
            }
        );
    });

    it("should strip matchType from TOTAL_BALANCE since it has no matching roles", () => {
        const parsed = itemRequirementSchema.parse({ type: "TOTAL_BALANCE", matchType: "NONE" });

        expect(parsed).not.toHaveProperty("matchType");
    });

    it("should apply ITEM defaults", () => {
        expect(itemRequirementSchema.parse({ type: "ITEM" })).toEqual({
            type: "ITEM",
            matchType: "EVERY",
            triggerFlags: 1,
            quantities: {},
        });
    });

    it("should keep provided ITEM quantities", () => {
        expect(
            itemRequirementSchema.parse({
                type: "ITEM",
                matchType: "NONE",
                quantities: { sword: 2, shield: 1 },
            })
        ).toEqual({
            type: "ITEM",
            matchType: "NONE",
            triggerFlags: 1,
            quantities: { sword: 2, shield: 1 },
        });
    });

    it("should reject unknown requirement types", () => {
        expect(itemRequirementSchema.safeParse({ type: "LEVEL" }).success).toBe(false);
        expect(itemRequirementSchema.safeParse({ type: "role" }).success).toBe(false);
    });

    it("should reject a missing discriminator", () => {
        expect(itemRequirementSchema.safeParse({}).success).toBe(false);
    });

    it("should reject non-integer TOTAL_BALANCE thresholds", () => {
        expect(itemRequirementSchema.safeParse({ type: "TOTAL_BALANCE", balance: 10.5 }).success).toBe(false);
    });

    it("should reject non-integer ITEM quantities", () => {
        expect(
            itemRequirementSchema.safeParse({ type: "ITEM", quantities: { sword: 1.5 } }).success
        ).toBe(false);
    });

    it("should reject a non-numeric ITEM quantity value", () => {
        expect(
            itemRequirementSchema.safeParse({ type: "ITEM", quantities: { sword: "two" } }).success
        ).toBe(false);
    });
});

describe("itemActionSchema", () => {
    it("should default RESPOND to the shared DEFAULT_ITEM_MESSAGE layout", () => {
        expect(itemActionSchema.parse({ type: "RESPOND" })).toEqual({
            type: "RESPOND",
            triggerFlags: 1,
            message: DEFAULT_ITEM_MESSAGE,
        });
    });

    it("should keep an explicitly provided RESPOND layout and fill its sub-defaults", () => {
        expect(
            itemActionSchema.parse({ type: "RESPOND", message: { format: "TEXT", content: "Enjoy!" } })
        ).toEqual({
            type: "RESPOND",
            triggerFlags: 1,
            message: { format: "TEXT", content: "Enjoy!", embed: {} },
        });
    });

    it("should enforce the embedded messageLayout rules on an explicit RESPOND layout", () => {
        const result = itemActionSchema.safeParse({
            type: "RESPOND",
            message: { format: "TEXT", content: "   " },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe(
                "Message content cannot be empty when format is set to TEXT!"
            );
        }
    });

    it("should reject an empty EMBED layout on a RESPOND action", () => {
        const result = itemActionSchema.safeParse({
            type: "RESPOND",
            message: { format: "EMBED", embed: {} },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe(
                "Embed must have a title, description, or fields when format is set to EMBED!"
            );
        }
    });

    it("should apply ADD_ROLES defaults", () => {
        expect(itemActionSchema.parse({ type: "ADD_ROLES" })).toEqual({
            type: "ADD_ROLES",
            triggerFlags: 1,
            roleIds: [],
        });
    });

    it("should keep provided ADD_ROLES ids", () => {
        expect(
            itemActionSchema.parse({ type: "ADD_ROLES", roleIds: ["role_a"], triggerFlags: 3 })
        ).toEqual({
            type: "ADD_ROLES",
            triggerFlags: 3,
            roleIds: ["role_a"],
        });
    });

    it("should apply REMOVE_ROLES defaults", () => {
        expect(itemActionSchema.parse({ type: "REMOVE_ROLES" })).toEqual({
            type: "REMOVE_ROLES",
            triggerFlags: 1,
            roleIds: [],
        });
    });

    it("should keep provided REMOVE_ROLES ids", () => {
        expect(itemActionSchema.parse({ type: "REMOVE_ROLES", roleIds: ["role_b"] })).toEqual({
            type: "REMOVE_ROLES",
            triggerFlags: 1,
            roleIds: ["role_b"],
        });
    });

    it("should apply ADD_BALANCE defaults", () => {
        expect(itemActionSchema.parse({ type: "ADD_BALANCE" })).toEqual({
            type: "ADD_BALANCE",
            triggerFlags: 1,
            balance: 0,
        });
    });

    it("should keep a provided ADD_BALANCE amount", () => {
        expect(itemActionSchema.parse({ type: "ADD_BALANCE", balance: 500 })).toEqual({
            type: "ADD_BALANCE",
            triggerFlags: 1,
            balance: 500,
        });
    });

    it("should apply REMOVE_BALANCE defaults", () => {
        expect(itemActionSchema.parse({ type: "REMOVE_BALANCE" })).toEqual({
            type: "REMOVE_BALANCE",
            triggerFlags: 1,
            balance: 0,
        });
    });

    it("should keep a provided REMOVE_BALANCE amount", () => {
        expect(itemActionSchema.parse({ type: "REMOVE_BALANCE", balance: 250 })).toEqual({
            type: "REMOVE_BALANCE",
            triggerFlags: 1,
            balance: 250,
        });
    });

    it("should apply ADD_ITEMS defaults", () => {
        expect(itemActionSchema.parse({ type: "ADD_ITEMS" })).toEqual({
            type: "ADD_ITEMS",
            triggerFlags: 1,
            quantities: {},
            itemIds: [],
        });
    });

    it("should keep provided ADD_ITEMS ids and quantities", () => {
        expect(
            itemActionSchema.parse({
                type: "ADD_ITEMS",
                quantities: { sword: 2 },
                itemIds: [VALID_UUID],
            })
        ).toEqual({
            type: "ADD_ITEMS",
            triggerFlags: 1,
            quantities: { sword: 2 },
            itemIds: [VALID_UUID],
        });
    });

    it("should apply REMOVE_ITEMS defaults", () => {
        expect(itemActionSchema.parse({ type: "REMOVE_ITEMS" })).toEqual({
            type: "REMOVE_ITEMS",
            triggerFlags: 1,
            quantities: {},
            itemIds: [],
        });
    });

    it("should keep provided REMOVE_ITEMS ids and quantities", () => {
        expect(
            itemActionSchema.parse({
                type: "REMOVE_ITEMS",
                quantities: { sword: 1 },
                itemIds: [VALID_UUID],
            })
        ).toEqual({
            type: "REMOVE_ITEMS",
            triggerFlags: 1,
            quantities: { sword: 1 },
            itemIds: [VALID_UUID],
        });
    });

    it("should reject unknown action types", () => {
        expect(itemActionSchema.safeParse({ type: "TELEPORT" }).success).toBe(false);
        expect(itemActionSchema.safeParse({ type: "add_roles" }).success).toBe(false);
    });

    it("should reject a missing discriminator", () => {
        expect(itemActionSchema.safeParse({}).success).toBe(false);
    });

    it("should reject non-integer balance amounts", () => {
        expect(itemActionSchema.safeParse({ type: "ADD_BALANCE", balance: 1.5 }).success).toBe(false);
        expect(itemActionSchema.safeParse({ type: "REMOVE_BALANCE", balance: 1.5 }).success).toBe(false);
    });

    // The balance schemas are plain `z.number().int()`, unlike the config's rewards,
    // so a negative amount parses through to the bot rather than being rejected here.
    it("should accept a negative balance amount since only integrality is enforced", () => {
        expect(itemActionSchema.parse({ type: "ADD_BALANCE", balance: -10 })).toEqual({
            type: "ADD_BALANCE",
            triggerFlags: 1,
            balance: -10,
        });
        expect(itemActionSchema.parse({ type: "REMOVE_BALANCE", balance: -10 })).toEqual({
            type: "REMOVE_BALANCE",
            triggerFlags: 1,
            balance: -10,
        });
    });

    it("should reject non-integer ADD_ITEMS quantities", () => {
        expect(
            itemActionSchema.safeParse({ type: "ADD_ITEMS", quantities: { sword: 1.5 } }).success
        ).toBe(false);
    });

    it("should reject non-array roleIds", () => {
        expect(itemActionSchema.safeParse({ type: "ADD_ROLES", roleIds: "role_a" }).success).toBe(false);
        expect(itemActionSchema.safeParse({ type: "REMOVE_ROLES", roleIds: "role_a" }).success).toBe(false);
    });
});

describe("economyCategorySchema", () => {
    it("should parse a category without an id", () => {
        expect(economyCategorySchema.parse({ name: "Weapons" })).toEqual({ name: "Weapons" });
    });

    it("should keep a supplied uuid id", () => {
        expect(economyCategorySchema.parse({ id: VALID_UUID, name: "Weapons" })).toEqual({
            id: VALID_UUID,
            name: "Weapons",
        });
    });

    it("should reject an empty name with the required message", () => {
        const result = economyCategorySchema.safeParse({ name: "" });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Name is required");
            expect(result.error.issues[0].path).toEqual(["name"]);
        }
    });

    it("should reject names longer than 100 characters", () => {
        expect(economyCategorySchema.safeParse({ name: "a".repeat(101) }).success).toBe(false);
    });

    it("should accept a name of exactly 100 characters", () => {
        expect(economyCategorySchema.safeParse({ name: "a".repeat(100) }).success).toBe(true);
    });

    it("should reject a non-uuid id", () => {
        expect(economyCategorySchema.safeParse({ id: "not-a-uuid", name: "Weapons" }).success).toBe(false);
    });

    it("should reject a missing name", () => {
        expect(economyCategorySchema.safeParse({}).success).toBe(false);
    });
});

describe("economyItemSchema", () => {
    it("should apply defaults for a name-only item", () => {
        expect(economyItemSchema.parse({ name: "Sword" })).toEqual({
            name: "Sword",
            price: 0,
            description: "",
            category: null,
            unlimitedStock: true,
            stockRemaining: 0,
            isListed: true,
            isInventory: true,
            isUsable: false,
            isSellable: false,
            requirements: [],
            actions: [],
        });
    });

    it("should keep every provided field", () => {
        const parsed = economyItemSchema.parse({
            id: VALID_UUID,
            name: "Sword",
            price: 250,
            description: "Sharp",
            emoji: "⚔️",
            category: "cat_1",
            unlimitedStock: false,
            stockRemaining: 5,
            isListed: false,
            isInventory: false,
            isUsable: true,
            isSellable: true,
        });

        expect(parsed).toEqual({
            id: VALID_UUID,
            name: "Sword",
            price: 250,
            description: "Sharp",
            emoji: "⚔️",
            category: "cat_1",
            unlimitedStock: false,
            stockRemaining: 5,
            isListed: false,
            isInventory: false,
            isUsable: true,
            isSellable: true,
            requirements: [],
            actions: [],
        });
    });

    it("should coerce an explicit null category", () => {
        expect(economyItemSchema.parse({ name: "Sword", category: null }).category).toBeNull();
    });

    it("should omit emoji when it is not supplied", () => {
        expect(economyItemSchema.parse({ name: "Sword" })).not.toHaveProperty("emoji");
    });

    it("should leave emoji undefined when it is explicitly passed as undefined", () => {
        expect(economyItemSchema.parse({ name: "Sword", emoji: undefined }).emoji).toBeUndefined();
    });

    it("should default requirements and actions to empty arrays", () => {
        const parsed = economyItemSchema.parse({ name: "Sword" });

        expect(parsed.requirements).toEqual([]);
        expect(parsed.actions).toEqual([]);
    });

    it("should parse nested requirements and actions", () => {
        const parsed = economyItemSchema.parse({
            name: "Sword",
            requirements: [{ type: "TOTAL_BALANCE", balance: 100 }],
            actions: [{ type: "ADD_ROLES", roleIds: ["role_a"] }],
        });

        expect(parsed.requirements).toEqual([{ type: "TOTAL_BALANCE", triggerFlags: 1, balance: 100 }]);
        expect(parsed.actions).toEqual([
            { type: "ADD_ROLES", triggerFlags: 1, roleIds: ["role_a"] },
        ]);
    });

    it("should reject an invalid nested requirement", () => {
        expect(
            economyItemSchema.safeParse({ name: "Sword", requirements: [{ type: "NOPE" }] }).success
        ).toBe(false);
    });

    it("should reject an invalid nested action", () => {
        expect(
            economyItemSchema.safeParse({ name: "Sword", actions: [{ type: "NOPE" }] }).success
        ).toBe(false);
    });

    it("should reject an empty name with the required message", () => {
        const result = economyItemSchema.safeParse({ name: "" });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Name is required");
        }
    });

    it("should reject names longer than 100 characters", () => {
        expect(economyItemSchema.safeParse({ name: "a".repeat(101) }).success).toBe(false);
    });

    it("should reject a negative price", () => {
        expect(economyItemSchema.safeParse({ name: "Sword", price: -1 }).success).toBe(false);
    });

    it("should reject a fractional price", () => {
        expect(economyItemSchema.safeParse({ name: "Sword", price: 10.5 }).success).toBe(false);
    });

    it("should reject negative stockRemaining", () => {
        expect(economyItemSchema.safeParse({ name: "Sword", stockRemaining: -1 }).success).toBe(false);
    });

    it("should reject a non-uuid id", () => {
        expect(economyItemSchema.safeParse({ id: "abc", name: "Sword" }).success).toBe(false);
    });
});

describe("economyWorkMessageSchema", () => {
    it("should parse a message without an id", () => {
        expect(economyWorkMessageSchema.parse({ content: "Work!" })).toEqual({ content: "Work!" });
    });

    it("should keep a supplied uuid id", () => {
        expect(economyWorkMessageSchema.parse({ id: VALID_UUID, content: "Work!" })).toEqual({
            id: VALID_UUID,
            content: "Work!",
        });
    });

    it("should reject empty content with the required message", () => {
        const result = economyWorkMessageSchema.safeParse({ content: "" });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Message is required");
            expect(result.error.issues[0].path).toEqual(["content"]);
        }
    });

    it("should accept content of exactly 1000 characters", () => {
        expect(economyWorkMessageSchema.safeParse({ content: "a".repeat(1000) }).success).toBe(true);
    });

    it("should reject content longer than 1000 characters", () => {
        expect(economyWorkMessageSchema.safeParse({ content: "a".repeat(1001) }).success).toBe(false);
    });

    it("should reject a non-uuid id", () => {
        expect(economyWorkMessageSchema.safeParse({ id: "abc", content: "Work!" }).success).toBe(false);
    });
});

describe("economyLeaderboardEntrySchema", () => {
    it("should parse a fully populated entry", () => {
        expect(
            economyLeaderboardEntrySchema.parse({
                userId: "user_1",
                username: "tester",
                cash: 10,
                bank: 20,
                total: 30,
            })
        ).toEqual({ userId: "user_1", username: "tester", cash: 10, bank: 20, total: 30 });
    });

    it("should default a missing username to an empty string", () => {
        const parsed = economyLeaderboardEntrySchema.parse({
            userId: "user_1",
            cash: 0,
            bank: 0,
            total: 0,
        });

        expect(parsed.username).toBe("");
    });

    it("should reject a missing userId", () => {
        expect(economyLeaderboardEntrySchema.safeParse({ cash: 1, bank: 1, total: 2 }).success).toBe(false);
    });

    it("should reject non-integer balances", () => {
        expect(
            economyLeaderboardEntrySchema.safeParse({
                userId: "user_1",
                cash: 1.5,
                bank: 0,
                total: 1,
            }).success
        ).toBe(false);
    });
});

describe("getLeaderboardInputSchema", () => {
    it("should default limit and offset", () => {
        expect(getLeaderboardInputSchema.parse({ guildId: "guild_123" })).toEqual({
            guildId: "guild_123",
            limit: 20,
            offset: 0,
        });
    });

    it("should keep explicit limit and offset", () => {
        expect(getLeaderboardInputSchema.parse({ guildId: "guild_123", limit: 5, offset: 50 })).toEqual({
            guildId: "guild_123",
            limit: 5,
            offset: 50,
        });
    });

    it("should accept the boundary values of 1 and 100 for limit", () => {
        expect(getLeaderboardInputSchema.safeParse({ guildId: "guild_123", limit: 1 }).success).toBe(true);
        expect(getLeaderboardInputSchema.safeParse({ guildId: "guild_123", limit: 100 }).success).toBe(
            true
        );
    });

    it("should reject a limit below 1 or above 100", () => {
        expect(getLeaderboardInputSchema.safeParse({ guildId: "guild_123", limit: 0 }).success).toBe(false);
        expect(getLeaderboardInputSchema.safeParse({ guildId: "guild_123", limit: 101 }).success).toBe(
            false
        );
    });

    it("should reject a negative offset", () => {
        expect(getLeaderboardInputSchema.safeParse({ guildId: "guild_123", offset: -1 }).success).toBe(
            false
        );
    });

    it("should accept a zero offset", () => {
        expect(getLeaderboardInputSchema.safeParse({ guildId: "guild_123", offset: 0 }).success).toBe(true);
    });

    it("should reject an empty guildId", () => {
        expect(getLeaderboardInputSchema.safeParse({ guildId: "" }).success).toBe(false);
    });

    it("should reject a missing guildId", () => {
        expect(getLeaderboardInputSchema.safeParse({}).success).toBe(false);
    });

    it("should reject non-integer limit and offset", () => {
        expect(getLeaderboardInputSchema.safeParse({ guildId: "g", limit: 1.5 }).success).toBe(false);
        expect(getLeaderboardInputSchema.safeParse({ guildId: "g", offset: 1.5 }).success).toBe(false);
    });
});