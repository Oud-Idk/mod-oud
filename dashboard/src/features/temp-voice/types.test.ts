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
        expect(saveTempVoiceHubInputSchema.safeParse(validBase()).success).toBe(true);
    });

    it("should REJECT a missing trigger channel", () => {
        const result = saveTempVoiceHubInputSchema.safeParse({
            ...validBase(),
            hub_channel_id: undefined,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((i) => i.path[0] === "hub_channel_id")).toBe(true);
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
        }
    });

    it("should REJECT an empty name", () => {
        const result = saveTempVoiceHubInputSchema.safeParse({
            ...validBase(),
            name: "",
        });

        expect(result.success).toBe(false);
    });

    it("should REJECT an empty default channel name", () => {
        const result = saveTempVoiceHubInputSchema.safeParse({
            ...validBase(),
            default_channel_name: "",
        });

        expect(result.success).toBe(false);
    });

    it("should REJECT an empty guild id", () => {
        const result = saveTempVoiceHubInputSchema.safeParse({
            ...validBase(),
            guild_id: "",
        });

        expect(result.success).toBe(false);
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
        expect(
            setupTempVoicePayloadSchema.safeParse({
                categoryName: "",
                hubChannelName: "Join",
            }).success
        ).toBe(false);
    });

    it("should REJECT an overlong hub channel name", () => {
        expect(
            setupTempVoicePayloadSchema.safeParse({
                categoryName: "Voice",
                hubChannelName: "x".repeat(101),
            }).success
        ).toBe(false);
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

    it("should REJECT a missing hub channel id", () => {
        expect(
            backendSetupResponseSchema.safeParse({ category_id: "cat_1" }).success
        ).toBe(false);
    });
});
