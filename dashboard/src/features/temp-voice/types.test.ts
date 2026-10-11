import { describe, it, expect } from "vitest";
import {
    tempVoiceHubSchema,
    saveTempVoiceHubInputSchema,
    setupTempVoicePayloadSchema,
    backendSetupResponseSchema,
} from "./types";

describe("tempVoiceHubSchema", () => {
    it("should apply defaults", () => {
        const parsed = tempVoiceHubSchema.parse({
            id: "hub_1",
            guild_id: "guild_123",
        });

        expect(parsed.name).toBe("New Hub");
        expect(parsed.hub_channel_id).toBeNull();
        expect(parsed.category_id).toBeNull();
        expect(parsed.user_limit).toBeNull();
        expect(parsed.interface_channel_id).toBeNull();
        expect(parsed.default_channel_name).toBe("{user.display_name}'s Lounge");
    });

    it("should keep provided values", () => {
        const parsed = tempVoiceHubSchema.parse({
            id: "hub_1",
            guild_id: "guild_123",
            name: "Gaming",
            hub_channel_id: "chan_1",
            category_id: "cat_1",
            user_limit: 5,
            interface_channel_id: "chan_2",
            default_channel_name: "{user.display_name}'s Game",
        });

        expect(parsed.name).toBe("Gaming");
        expect(parsed.user_limit).toBe(5);
        expect(parsed.default_channel_name).toBe("{user.display_name}'s Game");
    });

    it("should REJECT a missing id", () => {
        expect(
            tempVoiceHubSchema.safeParse({ guild_id: "guild_123" }).success
        ).toBe(false);
    });

    it("should REJECT a missing guild id", () => {
        expect(tempVoiceHubSchema.safeParse({ id: "hub_1" }).success).toBe(false);
    });

    it("should keep explicit nulls", () => {
        const parsed = tempVoiceHubSchema.parse({
            id: "hub_1",
            guild_id: "guild_123",
            hub_channel_id: null,
            category_id: null,
            user_limit: null,
            interface_channel_id: null,
        });

        expect(parsed.hub_channel_id).toBeNull();
        expect(parsed.category_id).toBeNull();
        expect(parsed.user_limit).toBeNull();
        expect(parsed.interface_channel_id).toBeNull();
    });

    it("should REJECT a non numeric user limit", () => {
        expect(
            tempVoiceHubSchema.safeParse({
                id: "hub_1",
                guild_id: "guild_123",
                user_limit: "many",
            }).success
        ).toBe(false);
    });
});

describe("saveTempVoiceHubInputSchema", () => {
    function validBase(): { guild_id: string; name: string; hub_channel_id: string; category_id: string; default_channel_name: string } {
        return {
            guild_id: "guild_123",
            name: "Gaming",
            hub_channel_id: "chan_1",
            category_id: "cat_1",
            default_channel_name: "{user.display_name}'s Lounge",
        };
    }

    it("should accept a valid hub", () => {
        const result = saveTempVoiceHubInputSchema.safeParse(validBase());

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.id).toBeNull();
            expect(result.data.user_limit).toBeNull();
            expect(result.data.interface_channel_id).toBeNull();
        }
    });

    it("should keep a provided string id", () => {
        const result = saveTempVoiceHubInputSchema.safeParse({
            ...validBase(),
            id: "hub_1",
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.id).toBe("hub_1");
        }
    });

    it("should coerce a blank id to null", () => {
        for (const id of ["", "   "]) {
            const result = saveTempVoiceHubInputSchema.safeParse({
                ...validBase(),
                id,
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.id).toBeNull();
            }
        }
    });

    it("should coerce a missing id to null", () => {
        for (const id of [undefined, null]) {
            const result = saveTempVoiceHubInputSchema.safeParse({
                ...validBase(),
                id,
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.id).toBeNull();
            }
        }
    });

    it("should REJECT a missing trigger channel", () => {
        const result = saveTempVoiceHubInputSchema.safeParse({
            ...validBase(),
            hub_channel_id: undefined,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((i) => i.path[0] === "hub_channel_id")).toBe(true);
            expect(result.error.issues[0].message).toBe("Please select a trigger voice channel.");
            expect(result.error.issues[0].code).toBe("custom");
        }
    });

    it("should REJECT a null trigger channel", () => {
        const result = saveTempVoiceHubInputSchema.safeParse({
            ...validBase(),
            hub_channel_id: null,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Please select a trigger voice channel.");
            expect(result.error.issues[0].code).toBe("custom");
        }
    });

    it("should REJECT a blank trigger channel", () => {
        for (const hub_channel_id of ["", "   "]) {
            const result = saveTempVoiceHubInputSchema.safeParse({
                ...validBase(),
                hub_channel_id,
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe(
                    "Please select a trigger voice channel."
                );
                expect(result.error.issues[0].code).toBe("custom");
            }
        }
    });

    it("should REJECT a missing category", () => {
        const result = saveTempVoiceHubInputSchema.safeParse({
            ...validBase(),
            category_id: undefined,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((i) => i.path[0] === "category_id")).toBe(true);
            expect(result.error.issues[0].message).toBe("Please select a parent category.");
            expect(result.error.issues[0].code).toBe("custom");
        }
    });

    it("should REJECT a null category", () => {
        const result = saveTempVoiceHubInputSchema.safeParse({
            ...validBase(),
            category_id: null,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Please select a parent category.");
            expect(result.error.issues[0].code).toBe("custom");
        }
    });

    it("should REJECT a blank category", () => {
        for (const category_id of ["", "   "]) {
            const result = saveTempVoiceHubInputSchema.safeParse({
                ...validBase(),
                category_id,
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe("Please select a parent category.");
                expect(result.error.issues[0].code).toBe("custom");
            }
        }
    });

    it("should REJECT an empty name", () => {
        const result = saveTempVoiceHubInputSchema.safeParse({
            ...validBase(),
            name: "",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Hub name is required");
        }
    });

    it("should REJECT an empty default channel name", () => {
        const result = saveTempVoiceHubInputSchema.safeParse({
            ...validBase(),
            default_channel_name: "",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Default channel name is required");
        }
    });

    it("should REJECT an empty guild id", () => {
        const result = saveTempVoiceHubInputSchema.safeParse({
            ...validBase(),
            guild_id: "",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Guild ID is required");
        }
    });

    it("should default nullish limits", () => {
        const result = saveTempVoiceHubInputSchema.safeParse(validBase());

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.user_limit).toBeNull();
            expect(result.data.interface_channel_id).toBeNull();
        }
    });

    it("should keep a zero user limit", () => {
        const result = saveTempVoiceHubInputSchema.safeParse({
            ...validBase(),
            user_limit: 0,
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.user_limit).toBe(0);
        }
    });
});

describe("setupTempVoicePayloadSchema", () => {
    it("should accept a valid payload", () => {
        const result = setupTempVoicePayloadSchema.safeParse({
            categoryName: "Voice Channels",
            hubChannelName: "Join to Create",
        });

        expect(result.success).toBe(true);
    });

    it("should REJECT an empty category name", () => {
        const result = setupTempVoicePayloadSchema.safeParse({
            categoryName: "",
            hubChannelName: "Join",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Category name cannot be empty");
        }
    });

    it("should REJECT an empty hub channel name", () => {
        const result = setupTempVoicePayloadSchema.safeParse({
            categoryName: "Voice",
            hubChannelName: "",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Hub channel name cannot be empty");
        }
    });

    it("should REJECT an overlong category name", () => {
        expect(
            setupTempVoicePayloadSchema.safeParse({
                categoryName: "x".repeat(101),
                hubChannelName: "Join",
            }).success
        ).toBe(false);
    });

    it("should REJECT an overlong hub channel name", () => {
        const result = setupTempVoicePayloadSchema.safeParse({
            categoryName: "Voice",
            hubChannelName: "x".repeat(101),
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toContain("Too big");
        }
    });

    it("should accept names at the length limit", () => {
        expect(
            setupTempVoicePayloadSchema.safeParse({
                categoryName: "x".repeat(100),
                hubChannelName: "y".repeat(100),
            }).success
        ).toBe(true);
    });
});

describe("backendSetupResponseSchema", () => {
    it("should apply defaults and coerce strings", () => {
        const parsed = backendSetupResponseSchema.parse({
            category_id: "cat_1",
            hub_channel_id: "chan_1",
        });

        expect(parsed.category_id).toBe("cat_1");
        expect(parsed.interface_channel_id).toBeNull();
    });

    it("should keep a provided interface channel", () => {
        const parsed = backendSetupResponseSchema.parse({
            category_id: "cat_1",
            hub_channel_id: "chan_1",
            interface_channel_id: "chan_2",
        });

        expect(parsed.interface_channel_id).toBe("chan_2");
    });

    it("should keep an explicit null interface channel as null", () => {
        const parsed = backendSetupResponseSchema.parse({
            category_id: "cat_1",
            hub_channel_id: "chan_1",
            interface_channel_id: null,
        });

        expect(parsed.interface_channel_id).toBeNull();
    });

    it("should REJECT a missing hub channel id", () => {
        expect(
            backendSetupResponseSchema.safeParse({ category_id: "cat_1" }).success
        ).toBe(false);
    });

    it("should REJECT a missing category id", () => {
        expect(
            backendSetupResponseSchema.safeParse({ hub_channel_id: "chan_1" }).success
        ).toBe(false);
    });
});
