import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    deleteEconomyCategoryAction,
    deleteEconomyItemAction,
    deleteEconomyWorkMessageAction,
    fetchMoreEconomyLeaderboardAction,
    saveEconomyCategoryAction,
    saveEconomyConfigAction,
    saveEconomyItemAction,
    saveEconomyWorkMessageAction,
    syncEconomyWorkMessagesAction,
} from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import {
    deleteEconomyCategory,
    deleteEconomyItem,
    deleteEconomyWorkMessage,
    fetchMoreEconomyLeaderboard,
    saveEconomyCategory,
    saveEconomyConfig,
    saveEconomyItem,
    saveEconomyWorkMessage,
    syncEconomyWorkMessages,
} from "@/features/economy/queries";
import {
    economyCategorySchema,
    economyItemSchema,
    economyWorkMessageSchema,
    type EconomyConfigInput,
} from "@/features/economy/types";
import { revalidatePath } from "next/cache";
import { z } from "zod";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("@/features/economy/queries", () => ({
    saveEconomyConfig: vi.fn(),
    saveEconomyItem: vi.fn(),
    deleteEconomyItem: vi.fn(),
    saveEconomyCategory: vi.fn(),
    deleteEconomyCategory: vi.fn(),
    saveEconomyWorkMessage: vi.fn(),
    deleteEconomyWorkMessage: vi.fn(),
    syncEconomyWorkMessages: vi.fn(),
    fetchMoreEconomyLeaderboard: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

const GUILD_ID = "guild_123";
const ECONOMY_PATH = `/dashboard/${GUILD_ID}/economy`;
const ITEM_UUID = "11111111-1111-4111-8111-111111111111";
const CATEGORY_UUID = "22222222-2222-4222-8222-222222222222";
const MESSAGE_UUID = "33333333-3333-4333-8333-333333333333";

const savedItem = economyItemSchema.parse({ id: ITEM_UUID, name: "Sword", price: 250 });
const savedCategory = economyCategorySchema.parse({ id: CATEGORY_UUID, name: "Weapons" });
const savedWorkMessage = economyWorkMessageSchema.parse({ id: MESSAGE_UUID, content: "Work!" });

function authorize(): void {
    vi.mocked(verifyGuildAccess).mockResolvedValue({
        id: "user_123",
        name: "Test User",
    });
}

// Compares the rejection message exactly. `rejects.toThrow("...")` is a substring
// match, and a leaked ZodError's JSON payload also contains the first issue's text,
// so only an exact comparison can tell a proper `issues[0].message` rethrow apart
// from a handler that forgot to unwrap the error.
async function rejectionMessage(promise: Promise<unknown>): Promise<string> {
    try {
        await promise;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
    throw new Error("Expected the promise to reject, but it resolved.");
}

function denyAccess(message = "Forbidden: You do not have permission to manage this server."): void {
    vi.mocked(verifyGuildAccess).mockRejectedValue(new Error(message));
}

describe("Economy Server Actions", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("saveEconomyConfigAction", () => {
        const mockInput: EconomyConfigInput = {
            enabled: true,
            currencyName: "Coins",
            workCooldownSecs: 60,
            workMinReward: 10,
            workMaxReward: 50,
        };

        it("should verify access, validate and save the config, and revalidate the path", async () => {
            authorize();

            await saveEconomyConfigAction(GUILD_ID, mockInput);

            expect(verifyGuildAccess).toHaveBeenCalledWith(GUILD_ID);
            expect(saveEconomyConfig).toHaveBeenCalledWith(GUILD_ID, expect.anything());
            expect(revalidatePath).toHaveBeenCalledWith(ECONOMY_PATH);
        });

        it("should save the Zod-parsed config with every default filled in", async () => {
            authorize();

            await saveEconomyConfigAction(GUILD_ID, { enabled: true, currencyName: "gems" });

            expect(saveEconomyConfig).toHaveBeenCalledWith(GUILD_ID, {
                enabled: true,
                currencyName: "gems",
                workCooldownSecs: 3600,
                workMinReward: 1000,
                workMaxReward: 5000,
                workMessage: "You earned **{reward} {currency}**!",
                startingBalance: 0,
                giftingEnabled: true,
            });
        });

        it("should NOT save when verifyGuildAccess throws", async () => {
            denyAccess("Unauthorized guild access");

            await expect(saveEconomyConfigAction(GUILD_ID, { enabled: true })).rejects.toThrow(
                "Unauthorized guild access"
            );

            expect(saveEconomyConfig).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should reject an inverted reward range with the first zod issue message", async () => {
            authorize();

            await expect(
                rejectionMessage(
                    saveEconomyConfigAction(GUILD_ID, { workMinReward: 6000, workMaxReward: 5000 })
                )
            ).resolves.toBe("Minimum work reward must be less than or equal to maximum work reward.");

            expect(saveEconomyConfig).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should reject a negative cooldown with the first zod issue message", async () => {
            authorize();

            await expect(
                rejectionMessage(saveEconomyConfigAction(GUILD_ID, { workCooldownSecs: -1 }))
            ).resolves.toBe("Too small: expected number to be >=0");

            expect(saveEconomyConfig).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should propagate a database error thrown by saveEconomyConfig", async () => {
            authorize();
            vi.mocked(saveEconomyConfig).mockRejectedValue(new Error("Database connection failed"));

            await expect(saveEconomyConfigAction(GUILD_ID, { enabled: true })).rejects.toThrow(
                "Database connection failed"
            );

            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            authorize();
            vi.mocked(saveEconomyConfig).mockRejectedValue("unexpected string throw");

            await expect(saveEconomyConfigAction(GUILD_ID, { enabled: true })).rejects.toThrow(
                "Could not save configuration."
            );

            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should rethrow the first zod issue message if a ZodError is thrown downstream", async () => {
            authorize();
            vi.mocked(saveEconomyConfig).mockRejectedValue(
                new z.ZodError([
                    {
                        code: "custom",
                        message: "Downstream schema validation failure",
                        path: [],
                    },
                ])
            );

            await expect(saveEconomyConfigAction(GUILD_ID, { enabled: true })).rejects.toThrow(
                "Downstream schema validation failure"
            );
        });
    });

    describe("saveEconomyItemAction", () => {
        it("should verify access, validate, save and return the item", async () => {
            authorize();
            vi.mocked(saveEconomyItem).mockResolvedValue(savedItem);

            const result = await saveEconomyItemAction(GUILD_ID, { id: ITEM_UUID, name: "Sword" });

            expect(verifyGuildAccess).toHaveBeenCalledWith(GUILD_ID);
            expect(saveEconomyItem).toHaveBeenCalledWith(
                GUILD_ID,
                economyItemSchema.parse({ id: ITEM_UUID, name: "Sword" })
            );
            expect(result).toEqual(savedItem);
            expect(revalidatePath).toHaveBeenCalledWith(ECONOMY_PATH);
        });

        it("should reject an item with no name before touching the database", async () => {
            authorize();

            await expect(
                rejectionMessage(saveEconomyItemAction(GUILD_ID, { name: "" }))
            ).resolves.toBe("Name is required");

            expect(saveEconomyItem).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should reject an item carrying an invalid nested requirement", async () => {
            authorize();

            await expect(
                rejectionMessage(
                    saveEconomyItemAction(GUILD_ID, { name: "Sword", requirements: [{ type: "NOPE" }] })
                )
            ).resolves.toBe("Invalid discriminator value. Expected 'ROLE' | 'TOTAL_BALANCE' | 'ITEM'");

            expect(saveEconomyItem).not.toHaveBeenCalled();
        });

        it("should reject an item carrying an invalid nested action", async () => {
            authorize();

            await expect(
                rejectionMessage(
                    saveEconomyItemAction(GUILD_ID, { name: "Sword", actions: [{ type: "TELEPORT" }] })
                )
            ).resolves.toBe(
                "Invalid discriminator value. Expected 'RESPOND' | 'ADD_ROLES' | 'REMOVE_ROLES' | 'ADD_BALANCE' | 'REMOVE_BALANCE' | 'ADD_ITEMS' | 'REMOVE_ITEMS'"
            );

            expect(saveEconomyItem).not.toHaveBeenCalled();
        });

        it("should translate the named unique-constraint violation into a friendly message", async () => {
            authorize();
            vi.mocked(saveEconomyItem).mockRejectedValue(
                new Error('duplicate key value violates unique constraint "uq_economy_items_guild_name"')
            );

            await expect(saveEconomyItemAction(GUILD_ID, { name: "Sword" })).rejects.toThrow(
                "An item with this name already exists. Please choose a different name."
            );

            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should translate a bare duplicate-key violation into a friendly message", async () => {
            authorize();
            vi.mocked(saveEconomyItem).mockRejectedValue(
                new Error("duplicate key value violates unique constraint \"other_constraint\"")
            );

            await expect(saveEconomyItemAction(GUILD_ID, { name: "Sword" })).rejects.toThrow(
                "An item with this name already exists. Please choose a different name."
            );
        });

        it("should pass through an unrelated database error untouched", async () => {
            authorize();
            vi.mocked(saveEconomyItem).mockRejectedValue(new Error("connection reset by peer"));

            await expect(saveEconomyItemAction(GUILD_ID, { name: "Sword" })).rejects.toThrow(
                "connection reset by peer"
            );

            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            authorize();
            vi.mocked(saveEconomyItem).mockRejectedValue("kaboom");

            await expect(saveEconomyItemAction(GUILD_ID, { name: "Sword" })).rejects.toThrow(
                "Could not save item."
            );
        });

        it("should NOT save when verifyGuildAccess throws", async () => {
            denyAccess();

            await expect(saveEconomyItemAction(GUILD_ID, { name: "Sword" })).rejects.toThrow(
                "Forbidden: You do not have permission to manage this server."
            );

            expect(saveEconomyItem).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });
    });

    describe("deleteEconomyItemAction", () => {
        it("should verify access, delete, revalidate and return the result", async () => {
            authorize();
            vi.mocked(deleteEconomyItem).mockResolvedValue(true);

            const result = await deleteEconomyItemAction(GUILD_ID, ITEM_UUID);

            expect(verifyGuildAccess).toHaveBeenCalledWith(GUILD_ID);
            expect(deleteEconomyItem).toHaveBeenCalledWith(GUILD_ID, ITEM_UUID);
            expect(result).toBe(true);
            expect(revalidatePath).toHaveBeenCalledWith(ECONOMY_PATH);
        });

        it("should return false and still revalidate when nothing was deleted", async () => {
            authorize();
            vi.mocked(deleteEconomyItem).mockResolvedValue(false);

            expect(await deleteEconomyItemAction(GUILD_ID, ITEM_UUID)).toBe(false);
            expect(revalidatePath).toHaveBeenCalledWith(ECONOMY_PATH);
        });

        it("should NOT delete when verifyGuildAccess throws", async () => {
            denyAccess();

            await expect(deleteEconomyItemAction(GUILD_ID, ITEM_UUID)).rejects.toThrow(
                "Forbidden"
            );

            expect(deleteEconomyItem).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should propagate a database error", async () => {
            authorize();
            vi.mocked(deleteEconomyItem).mockRejectedValue(new Error("connection lost"));

            await expect(deleteEconomyItemAction(GUILD_ID, ITEM_UUID)).rejects.toThrow(
                "connection lost"
            );

            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            authorize();
            vi.mocked(deleteEconomyItem).mockRejectedValue("nope");

            await expect(deleteEconomyItemAction(GUILD_ID, ITEM_UUID)).rejects.toThrow(
                "Could not delete item."
            );
        });
    });

    describe("saveEconomyCategoryAction", () => {
        it("should verify access, validate, save and return the category", async () => {
            authorize();
            vi.mocked(saveEconomyCategory).mockResolvedValue(savedCategory);

            const result = await saveEconomyCategoryAction(GUILD_ID, {
                id: CATEGORY_UUID,
                name: "Weapons",
            });

            expect(verifyGuildAccess).toHaveBeenCalledWith(GUILD_ID);
            expect(saveEconomyCategory).toHaveBeenCalledWith(GUILD_ID, savedCategory);
            expect(result).toEqual(savedCategory);
            expect(revalidatePath).toHaveBeenCalledWith(ECONOMY_PATH);
        });

        it("should reject an empty category name before touching the database", async () => {
            authorize();

            await expect(
                rejectionMessage(saveEconomyCategoryAction(GUILD_ID, { name: "" }))
            ).resolves.toBe("Name is required");

            expect(saveEconomyCategory).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should reject a category name longer than 100 characters", async () => {
            authorize();

            await expect(
                rejectionMessage(
                    saveEconomyCategoryAction(GUILD_ID, { name: "a".repeat(101) })
                )
            ).resolves.toBe("Too big: expected string to have <=100 characters");

            expect(saveEconomyCategory).not.toHaveBeenCalled();
        });

        it("should translate the named unique-constraint violation into a friendly message", async () => {
            authorize();
            vi.mocked(saveEconomyCategory).mockRejectedValue(
                new Error(
                    'duplicate key value violates unique constraint "uq_economy_categories_guild_name"'
                )
            );

            await expect(saveEconomyCategoryAction(GUILD_ID, { name: "Weapons" })).rejects.toThrow(
                "A category with this name already exists."
            );

            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should translate a bare duplicate-key violation into a friendly message", async () => {
            authorize();
            vi.mocked(saveEconomyCategory).mockRejectedValue(
                new Error("duplicate key value violates unique constraint")
            );

            await expect(saveEconomyCategoryAction(GUILD_ID, { name: "Weapons" })).rejects.toThrow(
                "A category with this name already exists."
            );
        });

        it("should pass through an unrelated database error untouched", async () => {
            authorize();
            vi.mocked(saveEconomyCategory).mockRejectedValue(new Error("connection reset by peer"));

            await expect(saveEconomyCategoryAction(GUILD_ID, { name: "Weapons" })).rejects.toThrow(
                "connection reset by peer"
            );
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            authorize();
            vi.mocked(saveEconomyCategory).mockRejectedValue("kaboom");

            await expect(saveEconomyCategoryAction(GUILD_ID, { name: "Weapons" })).rejects.toThrow(
                "Could not save category."
            );
        });

        it("should NOT save when verifyGuildAccess throws", async () => {
            denyAccess();

            await expect(saveEconomyCategoryAction(GUILD_ID, { name: "Weapons" })).rejects.toThrow(
                "Forbidden"
            );

            expect(saveEconomyCategory).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });
    });

    describe("deleteEconomyCategoryAction", () => {
        it("should verify access, delete, revalidate and return the result", async () => {
            authorize();
            vi.mocked(deleteEconomyCategory).mockResolvedValue(true);

            const result = await deleteEconomyCategoryAction(GUILD_ID, CATEGORY_UUID);

            expect(deleteEconomyCategory).toHaveBeenCalledWith(GUILD_ID, CATEGORY_UUID);
            expect(result).toBe(true);
            expect(revalidatePath).toHaveBeenCalledWith(ECONOMY_PATH);
        });

        it("should return false when nothing was deleted", async () => {
            authorize();
            vi.mocked(deleteEconomyCategory).mockResolvedValue(false);

            expect(await deleteEconomyCategoryAction(GUILD_ID, CATEGORY_UUID)).toBe(false);
        });

        it("should NOT delete when verifyGuildAccess throws", async () => {
            denyAccess();

            await expect(deleteEconomyCategoryAction(GUILD_ID, CATEGORY_UUID)).rejects.toThrow(
                "Forbidden"
            );

            expect(deleteEconomyCategory).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should propagate a database error", async () => {
            authorize();
            vi.mocked(deleteEconomyCategory).mockRejectedValue(new Error("connection lost"));

            await expect(deleteEconomyCategoryAction(GUILD_ID, CATEGORY_UUID)).rejects.toThrow(
                "connection lost"
            );

            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            authorize();
            vi.mocked(deleteEconomyCategory).mockRejectedValue("nope");

            await expect(deleteEconomyCategoryAction(GUILD_ID, CATEGORY_UUID)).rejects.toThrow(
                "Could not delete category."
            );
        });
    });

    describe("saveEconomyWorkMessageAction", () => {
        it("should verify access, validate, save and return the message", async () => {
            authorize();
            vi.mocked(saveEconomyWorkMessage).mockResolvedValue(savedWorkMessage);

            const result = await saveEconomyWorkMessageAction(GUILD_ID, {
                id: MESSAGE_UUID,
                content: "Work!",
            });

            expect(saveEconomyWorkMessage).toHaveBeenCalledWith(GUILD_ID, savedWorkMessage);
            expect(result).toEqual(savedWorkMessage);
            expect(revalidatePath).toHaveBeenCalledWith(ECONOMY_PATH);
        });

        it("should reject an empty message before touching the database", async () => {
            authorize();

            await expect(
                rejectionMessage(saveEconomyWorkMessageAction(GUILD_ID, { content: "" }))
            ).resolves.toBe("Message is required");

            expect(saveEconomyWorkMessage).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should reject a message longer than 1000 characters", async () => {
            authorize();

            await expect(
                rejectionMessage(
                    saveEconomyWorkMessageAction(GUILD_ID, { content: "a".repeat(1001) })
                )
            ).resolves.toBe("Too big: expected string to have <=1000 characters");

            expect(saveEconomyWorkMessage).not.toHaveBeenCalled();
        });

        it("should propagate a database error", async () => {
            authorize();
            vi.mocked(saveEconomyWorkMessage).mockRejectedValue(new Error("connection lost"));

            await expect(saveEconomyWorkMessageAction(GUILD_ID, { content: "Work!" })).rejects.toThrow(
                "connection lost"
            );

            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            authorize();
            vi.mocked(saveEconomyWorkMessage).mockRejectedValue("kaboom");

            await expect(saveEconomyWorkMessageAction(GUILD_ID, { content: "Work!" })).rejects.toThrow(
                "Could not save work message."
            );
        });

        it("should NOT save when verifyGuildAccess throws", async () => {
            denyAccess();

            await expect(saveEconomyWorkMessageAction(GUILD_ID, { content: "Work!" })).rejects.toThrow(
                "Forbidden"
            );

            expect(saveEconomyWorkMessage).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });
    });

    describe("deleteEconomyWorkMessageAction", () => {
        it("should verify access, delete, revalidate and return the result", async () => {
            authorize();
            vi.mocked(deleteEconomyWorkMessage).mockResolvedValue(true);

            const result = await deleteEconomyWorkMessageAction(GUILD_ID, MESSAGE_UUID);

            expect(deleteEconomyWorkMessage).toHaveBeenCalledWith(GUILD_ID, MESSAGE_UUID);
            expect(result).toBe(true);
            expect(revalidatePath).toHaveBeenCalledWith(ECONOMY_PATH);
        });

        it("should return false when nothing was deleted", async () => {
            authorize();
            vi.mocked(deleteEconomyWorkMessage).mockResolvedValue(false);

            expect(await deleteEconomyWorkMessageAction(GUILD_ID, MESSAGE_UUID)).toBe(false);
        });

        it("should NOT delete when verifyGuildAccess throws", async () => {
            denyAccess();

            await expect(deleteEconomyWorkMessageAction(GUILD_ID, MESSAGE_UUID)).rejects.toThrow(
                "Forbidden"
            );

            expect(deleteEconomyWorkMessage).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should propagate a database error", async () => {
            authorize();
            vi.mocked(deleteEconomyWorkMessage).mockRejectedValue(new Error("connection lost"));

            await expect(deleteEconomyWorkMessageAction(GUILD_ID, MESSAGE_UUID)).rejects.toThrow(
                "connection lost"
            );

            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            authorize();
            vi.mocked(deleteEconomyWorkMessage).mockRejectedValue("nope");

            await expect(deleteEconomyWorkMessageAction(GUILD_ID, MESSAGE_UUID)).rejects.toThrow(
                "Could not delete work message."
            );
        });
    });

    describe("syncEconomyWorkMessagesAction", () => {
        it("should verify access, sync and return the resulting messages", async () => {
            authorize();
            vi.mocked(syncEconomyWorkMessages).mockResolvedValue([savedWorkMessage]);

            const result = await syncEconomyWorkMessagesAction(GUILD_ID, [
                { id: MESSAGE_UUID, content: "Work!" },
            ]);

            expect(syncEconomyWorkMessages).toHaveBeenCalledWith(GUILD_ID, [savedWorkMessage]);
            expect(result).toEqual([savedWorkMessage]);
            expect(revalidatePath).toHaveBeenCalledWith(ECONOMY_PATH);
        });

        it("should allow syncing to an empty list", async () => {
            authorize();
            vi.mocked(syncEconomyWorkMessages).mockResolvedValue([]);

            expect(await syncEconomyWorkMessagesAction(GUILD_ID, [])).toEqual([]);
            expect(syncEconomyWorkMessages).toHaveBeenCalledWith(GUILD_ID, []);
            expect(revalidatePath).toHaveBeenCalledWith(ECONOMY_PATH);
        });

        it("should reject a payload that is not an array before touching the database", async () => {
            authorize();

            await expect(
                rejectionMessage(syncEconomyWorkMessagesAction(GUILD_ID, { content: "Work!" }))
            ).resolves.toBe("Invalid input: expected array, received object");

            expect(syncEconomyWorkMessages).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should surface the first zod issue message from a bad array member", async () => {
            authorize();

            await expect(
                rejectionMessage(
                    syncEconomyWorkMessagesAction(GUILD_ID, [
                        { id: MESSAGE_UUID, content: "Work!" },
                        { content: "" },
                    ])
                )
            ).resolves.toBe("Message is required");

            expect(syncEconomyWorkMessages).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should propagate a database error", async () => {
            authorize();
            vi.mocked(syncEconomyWorkMessages).mockRejectedValue(new Error("deadlock detected"));

            await expect(syncEconomyWorkMessagesAction(GUILD_ID, [])).rejects.toThrow(
                "deadlock detected"
            );

            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            authorize();
            vi.mocked(syncEconomyWorkMessages).mockRejectedValue("kaboom");

            await expect(syncEconomyWorkMessagesAction(GUILD_ID, [])).rejects.toThrow(
                "Could not save work messages."
            );
        });

        it("should NOT sync when verifyGuildAccess throws", async () => {
            denyAccess();

            await expect(syncEconomyWorkMessagesAction(GUILD_ID, [])).rejects.toThrow("Forbidden");

            expect(syncEconomyWorkMessages).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });
    });

    describe("fetchMoreEconomyLeaderboardAction", () => {
        it("should verify access and return the next page of entries", async () => {
            authorize();
            const entries = [
                { userId: "user_3", username: "gamma", cash: 1, bank: 1, total: 2 },
            ];
            vi.mocked(fetchMoreEconomyLeaderboard).mockResolvedValue(entries);

            const result = await fetchMoreEconomyLeaderboardAction(GUILD_ID, 300);

            expect(verifyGuildAccess).toHaveBeenCalledWith(GUILD_ID);
            expect(fetchMoreEconomyLeaderboard).toHaveBeenCalledWith(GUILD_ID, 300);
            expect(result).toEqual(entries);
        });

        it("should NOT revalidate the path on a read-only fetch", async () => {
            authorize();
            vi.mocked(fetchMoreEconomyLeaderboard).mockResolvedValue([]);

            await fetchMoreEconomyLeaderboardAction(GUILD_ID, 300);

            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should NOT query when verifyGuildAccess throws", async () => {
            denyAccess();

            await expect(fetchMoreEconomyLeaderboardAction(GUILD_ID, 300)).rejects.toThrow(
                "Could not fetch leaderboard."
            );

            expect(fetchMoreEconomyLeaderboard).not.toHaveBeenCalled();
        });

        it("should mask the underlying database error behind a generic message", async () => {
            authorize();
            vi.mocked(fetchMoreEconomyLeaderboard).mockRejectedValue(new Error("connection lost"));

            await expect(fetchMoreEconomyLeaderboardAction(GUILD_ID, 300)).rejects.toThrow(
                "Could not fetch leaderboard."
            );
        });

        it("should throw the generic message on non-Error exceptions", async () => {
            authorize();
            vi.mocked(fetchMoreEconomyLeaderboard).mockRejectedValue("kaboom");

            await expect(fetchMoreEconomyLeaderboardAction(GUILD_ID, 300)).rejects.toThrow(
                "Could not fetch leaderboard."
            );
        });
    });
});