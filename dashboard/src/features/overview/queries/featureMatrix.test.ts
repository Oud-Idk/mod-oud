import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildFeatureCategories } from "../featureMatrix";
import type { FeatureMatrixCategory } from "../types";
import { getGuildFeatureMatrix } from "@/features/overview";

// Explicit mock function typing without any / unknown leakage
const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>>()
);

const mockBuildFeatureCategories = vi.hoisted(() =>
    vi.fn<(_args: Parameters<typeof buildFeatureCategories>[0]) => FeatureMatrixCategory[]>(() => [])
);

vi.mock("@/lib/db", () => ({
    db: { query: mockQuery },
}));

vi.mock("../featureMatrix", () => ({
    buildFeatureCategories: mockBuildFeatureCategories,
}));

describe("getGuildFeatureMatrix (Unit)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("maps all settings and string counts accurately to buildFeatureCategories", async () => {
        mockQuery
            .mockResolvedValueOnce({
                rows: [
                    {
                        settings: {
                            message_filtering: {
                                spam: { enabled: true },
                                invites: { enabled: false },
                                zalgo: { enabled: true },
                                malformed_rule: "not-an-object",
                            },
                            dynamic_slowmode: { enabled: true },
                            honeypot: { enabled: true },
                            report: { enabled: true },
                            raid_detection: { enabled: true },
                            message_logging: { enabled: true },
                            moderation_dms: {
                                warn: { enabled: true },
                                ban: { enabled: false },
                            },
                            leveling: { enabled: true },
                            economy: { enabled: true },
                            gambling: { enabled: true },
                            birthday: { enabled: true },
                            member_counter: { enabled: true },
                            tickets: { channel_id: "123456789012345678" },
                            invite_tracker: { enabled: true },
                            welcome: { enabled: true },
                            verification: { enabled: true },
                            leave: { enabled: true },
                        },
                    },
                ],
            })
            .mockResolvedValueOnce({
                rows: [
                    {
                        custom_commands: "5",
                        starboards: "2",
                        reaction_roles: "10",
                        reminders: "3",
                        media_only: "1",
                        temp_voice: "4",
                        giveaways: "8",
                        rss_feeds: "6",
                    },
                ],
            });

        const result = await getGuildFeatureMatrix("guild_123");

        expect(mockQuery).toHaveBeenCalledTimes(2);
        expect(mockBuildFeatureCategories).toHaveBeenCalledWith({
            guildId: "guild_123",
            mfEnabled: true,
            mfActiveCount: 2,
            antiRaidEnabled: true,
            dynSlowmodeEnabled: true,
            honeypotEnabled: true,
            reportEnabled: true,
            msgLoggingEnabled: true,
            modDmsEnabled: true,
            levelingEnabled: true,
            starboardsCount: 2,
            reactionRolesCount: 10,
            giveawaysCount: 8,
            economyEnabled: true,
            gamblingEnabled: true,
            birthdayEnabled: true,
            customCmdsCount: 5,
            ticketsEnabled: true,
            memberCounterEnabled: true,
            remindersCount: 3,
            rssCount: 6,
            tempVoiceCount: 4,
            mediaOnlyCount: 1,
            inviteTrackingEnabled: true,
            welcomeEnabled: true,
            verificationEnabled: true,
            leaveEnabled: true,
        });
        expect(result).toEqual([]);
    });

    it("falls back to default zeros and false values when rows are empty", async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        await getGuildFeatureMatrix("guild_empty");

        expect(mockBuildFeatureCategories).toHaveBeenCalledWith({
            guildId: "guild_empty",
            mfEnabled: false,
            mfActiveCount: 0,
            antiRaidEnabled: false,
            dynSlowmodeEnabled: false,
            honeypotEnabled: false,
            reportEnabled: false,
            msgLoggingEnabled: false,
            modDmsEnabled: false,
            levelingEnabled: false,
            starboardsCount: 0,
            reactionRolesCount: 0,
            giveawaysCount: 0,
            economyEnabled: false,
            gamblingEnabled: false,
            birthdayEnabled: false,
            customCmdsCount: 0,
            ticketsEnabled: false,
            memberCounterEnabled: false,
            remindersCount: 0,
            rssCount: 0,
            tempVoiceCount: 0,
            mediaOnlyCount: 0,
            inviteTrackingEnabled: false,
            welcomeEnabled: false,
            verificationEnabled: false,
            leaveEnabled: false,
        });
    });

    describe("ticketsEnabled edge cases", () => {
        it.each([
            ["valid channel_id", { channel_id: "123" }, true],
            ["valid category_id", { category_id: "456" }, true],
            ["numeric IDs (invalid)", { channel_id: 123 }, false],
            ["empty object", {}, false],
            ["null config", null, false],
        ])("evaluates %s as %s", async (_, ticketsConfig, expected) => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ settings: { tickets: ticketsConfig } }] })
                .mockResolvedValueOnce({ rows: [{}] });

            await getGuildFeatureMatrix("guild_123");

            expect(mockBuildFeatureCategories).toHaveBeenCalledWith(
                expect.objectContaining({ ticketsEnabled: expected })
            );
        });
    });

    describe("count parser edge cases", () => {
        it("converts invalid string counts to 0", async () => {
            mockQuery
                .mockResolvedValueOnce({ rows: [{ settings: {} }] })
                .mockResolvedValueOnce({
                    rows: [
                        {
                            custom_commands: "not-a-number",
                            starboards: undefined,
                            reaction_roles: 12,
                        },
                    ],
                });

            await getGuildFeatureMatrix("guild_123");

            expect(mockBuildFeatureCategories).toHaveBeenCalledWith(
                expect.objectContaining({
                    customCmdsCount: 0,
                    starboardsCount: 0,
                    reactionRolesCount: 12,
                })
            );
        });
    });

    describe("error handling", () => {
        it("returns an empty list and logs error when a query rejects", async () => {
            const dbError = new Error("Connection lost");
            mockQuery.mockRejectedValue(dbError);

            const result = await getGuildFeatureMatrix("guild_err");

            expect(result).toEqual([]);
        });
    });
});