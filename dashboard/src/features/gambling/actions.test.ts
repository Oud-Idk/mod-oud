import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { saveGamblingConfigAction } from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { saveGamblingConfig } from "@/features/gambling/queries";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { GamblingConfigInput } from "@/features/gambling/types";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("@/features/gambling/queries", () => ({
    saveGamblingConfig: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

const GUILD_ID = "guild_123";
const GAMBLING_PATH = `/dashboard/${GUILD_ID}/gambling`;

function authorize(): void {
    vi.mocked(verifyGuildAccess).mockResolvedValue({
        id: "user_123",
        name: "Test User",
    });
}

function denyAccess(message = "Forbidden: You do not have permission to manage this server."): void {
    vi.mocked(verifyGuildAccess).mockRejectedValue(new Error(message));
}

// `rejects.toThrow("...")` is a substring match, and a leaked ZodError's JSON
// payload also contains the first issue's text, so only an exact comparison can
// tell a proper `issues[0].message` rethrow apart from an unwrapped error.
async function rejectionMessage(promise: Promise<unknown>): Promise<string> {
    try {
        await promise;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
    throw new Error("Expected the promise to reject, but it resolved.");
}

describe("Gambling Server Actions", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("saveGamblingConfigAction", () => {
        const mockInput: GamblingConfigInput = {
            enabled: true,
            cooldownSecs: 30,
            minBet: 100,
            maxBet: 5000,
            timeoutSecs: 120,
        };

        it("should verify access, validate and save the config, and revalidate the path", async () => {
            authorize();

            await saveGamblingConfigAction(GUILD_ID, mockInput);

            expect(verifyGuildAccess).toHaveBeenCalledWith(GUILD_ID);
            expect(saveGamblingConfig).toHaveBeenCalledWith(GUILD_ID, expect.anything());
            expect(revalidatePath).toHaveBeenCalledWith(GAMBLING_PATH);
        });

        it("should save the Zod-parsed config with every default filled in", async () => {
            authorize();

            await saveGamblingConfigAction(GUILD_ID, { enabled: true });

            expect(saveGamblingConfig).toHaveBeenCalledWith(GUILD_ID, {
                enabled: true,
                cooldownSecs: 0,
                minBet: 10,
                maxBet: 0,
                timeoutSecs: 60,
                blackjack: { enabled: true },
                coinflip: { enabled: true },
                slots: { enabled: true },
                roulette: { enabled: true },
                higherlower: { enabled: true },
            });
        });

        it("should preserve a disabled game toggle through validation", async () => {
            authorize();

            await saveGamblingConfigAction(GUILD_ID, { slots: { enabled: false } });

            expect(saveGamblingConfig).toHaveBeenCalledWith(
                GUILD_ID,
                expect.objectContaining({ slots: { enabled: false } })
            );
        });

        it("should NOT save when verifyGuildAccess throws", async () => {
            denyAccess("Unauthorized guild access");

            await expect(saveGamblingConfigAction(GUILD_ID, { enabled: true })).rejects.toThrow(
                "Unauthorized guild access"
            );

            expect(saveGamblingConfig).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should reject an inverted bet range with the first zod issue message", async () => {
            authorize();

            await expect(
                rejectionMessage(
                    saveGamblingConfigAction(GUILD_ID, { minBet: 100, maxBet: 50 })
                )
            ).resolves.toBe("Maximum bet must be 0 (no cap) or >= minimum bet.");

            expect(saveGamblingConfig).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should accept a maxBet of 0 as no cap", async () => {
            authorize();

            await saveGamblingConfigAction(GUILD_ID, { minBet: 100, maxBet: 0 });

            expect(saveGamblingConfig).toHaveBeenCalledTimes(1);
            expect(revalidatePath).toHaveBeenCalledWith(GAMBLING_PATH);
        });

        it("should reject a minBet below 1 with the first zod issue message", async () => {
            authorize();

            await expect(
                rejectionMessage(saveGamblingConfigAction(GUILD_ID, { minBet: 0 }))
            ).resolves.toBe("Too small: expected number to be >=1");

            expect(saveGamblingConfig).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should reject a timeoutSecs outside the 10-300 range with the first zod issue message", async () => {
            authorize();

            await expect(
                rejectionMessage(saveGamblingConfigAction(GUILD_ID, { timeoutSecs: 5 }))
            ).resolves.toBe("Too small: expected number to be >=10");

            await expect(
                rejectionMessage(saveGamblingConfigAction(GUILD_ID, { timeoutSecs: 301 }))
            ).resolves.toBe("Too big: expected number to be <=300");

            expect(saveGamblingConfig).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should reject a negative cooldown with the first zod issue message", async () => {
            authorize();

            await expect(
                rejectionMessage(saveGamblingConfigAction(GUILD_ID, { cooldownSecs: -1 }))
            ).resolves.toBe("Too small: expected number to be >=0");

            expect(saveGamblingConfig).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should propagate a database error thrown by saveGamblingConfig", async () => {
            authorize();
            vi.mocked(saveGamblingConfig).mockRejectedValue(new Error("Database connection failed"));

            await expect(saveGamblingConfigAction(GUILD_ID, { enabled: true })).rejects.toThrow(
                "Database connection failed"
            );

            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            authorize();
            vi.mocked(saveGamblingConfig).mockRejectedValue("unexpected string throw");

            await expect(saveGamblingConfigAction(GUILD_ID, { enabled: true })).rejects.toThrow(
                "Could not save gambling configuration."
            );

            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should rethrow the first zod issue message if a ZodError is thrown downstream", async () => {
            authorize();
            vi.mocked(saveGamblingConfig).mockRejectedValue(
                new z.ZodError([
                    {
                        code: "custom",
                        message: "Downstream schema validation failure",
                        path: [],
                    },
                ])
            );

            await expect(saveGamblingConfigAction(GUILD_ID, { enabled: true })).rejects.toThrow(
                "Downstream schema validation failure"
            );
        });
    });
});