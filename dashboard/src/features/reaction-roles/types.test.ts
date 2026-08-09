import { describe, it, expect } from "vitest";
import {
    reactionRoleModeSchema,
    buttonStyleSchema,
    reactionRoleItemSchema,
    buttonRoleItemSchema,
    saveReactionMessageInputSchema,
    reactionMessageSchema,
} from "./types";

describe("reactionRoleModeSchema", () => {
    it("should accept REACTION and BUTTON", () => {
        expect(reactionRoleModeSchema.safeParse("REACTION").success).toBe(true);
        expect(reactionRoleModeSchema.safeParse("BUTTON").success).toBe(true);
    });

    it("should REJECT anything else", () => {
        expect(reactionRoleModeSchema.safeParse("SLASH").success).toBe(false);
    });
});

describe("buttonStyleSchema", () => {
    it("should accept all four styles", () => {
        expect(buttonStyleSchema.safeParse("PRIMARY").success).toBe(true);
        expect(buttonStyleSchema.safeParse("SECONDARY").success).toBe(true);
        expect(buttonStyleSchema.safeParse("SUCCESS").success).toBe(true);
        expect(buttonStyleSchema.safeParse("DANGER").success).toBe(true);
    });

    it("should REJECT an unknown style", () => {
        expect(buttonStyleSchema.safeParse("LINK").success).toBe(false);
    });
});

describe("reactionRoleItemSchema", () => {
    it("should default emoji to an empty string", () => {
        const parsed = reactionRoleItemSchema.parse({ role_id: "role_1" });

        expect(parsed.emoji).toBe("");
        expect(parsed.role_id).toBe("role_1");
    });
});

describe("buttonRoleItemSchema", () => {
    it("should apply the default PRIMARY style", () => {
        const parsed = buttonRoleItemSchema.parse({
            role_id: "role_1",
            custom_id: "btn_1",
        });

        expect(parsed.style).toBe("PRIMARY");
        expect(parsed.label).toBeUndefined();
        expect(parsed.emoji).toBeUndefined();
    });

    it("should keep a provided style", () => {
        const parsed = buttonRoleItemSchema.parse({
            role_id: "role_1",
            custom_id: "btn_1",
            style: "DANGER",
        });

        expect(parsed.style).toBe("DANGER");
    });
});

describe("saveReactionMessageInputSchema", () => {
    function validBase(): { name: string; guild_id: string; channel_id: string; message: { format: "TEXT"; content: string; embed: object } } {
        return {
            name: "Verify",
            guild_id: "guild_123",
            channel_id: "chan_1",
            message: { format: "TEXT", content: "Pick a role", embed: {} },
        };
    }

    it("should accept a valid REACTION message with a mapping", () => {
        const result = saveReactionMessageInputSchema.safeParse({
            ...validBase(),
            mode: "REACTION",
            reactions: [{ emoji: "🎉", role_id: "role_1" }],
        });

        expect(result.success).toBe(true);
    });

    it("should accept a valid BUTTON message with a mapping", () => {
        const result = saveReactionMessageInputSchema.safeParse({
            ...validBase(),
            mode: "BUTTON",
            buttons: [{ role_id: "role_1", custom_id: "btn_1" }],
        });

        expect(result.success).toBe(true);
    });

    it("should REJECT a missing channel", () => {
        const result = saveReactionMessageInputSchema.safeParse({
            ...validBase(),
            channel_id: undefined,
            mode: "REACTION",
            reactions: [{ emoji: "🎉", role_id: "role_1" }],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((i) => i.path[0] === "channel_id")).toBe(true);
        }
    });

    it("should REJECT a REACTION message with no mappings", () => {
        const result = saveReactionMessageInputSchema.safeParse({
            ...validBase(),
            mode: "REACTION",
            reactions: [],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((i) => i.path[0] === "reactions")).toBe(true);
        }
    });

    it("should REJECT a reaction missing its emoji", () => {
        const result = saveReactionMessageInputSchema.safeParse({
            ...validBase(),
            mode: "REACTION",
            reactions: [{ emoji: "", role_id: "role_1" }],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((i) => i.path[0] === "reactions")).toBe(true);
        }
    });

    it("should REJECT a reaction missing its role", () => {
        const result = saveReactionMessageInputSchema.safeParse({
            ...validBase(),
            mode: "REACTION",
            reactions: [{ emoji: "🎉", role_id: null }],
        });

        expect(result.success).toBe(false);
    });

    it("should REJECT a BUTTON message with no mappings", () => {
        const result = saveReactionMessageInputSchema.safeParse({
            ...validBase(),
            mode: "BUTTON",
            buttons: [],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((i) => i.path[0] === "buttons")).toBe(true);
        }
    });

    it("should REJECT a button missing its role", () => {
        const result = saveReactionMessageInputSchema.safeParse({
            ...validBase(),
            mode: "BUTTON",
            buttons: [{ role_id: "", custom_id: "btn_1" }],
        });

        expect(result.success).toBe(false);
    });

    it("should REJECT an empty name", () => {
        const result = saveReactionMessageInputSchema.safeParse({
            ...validBase(),
            name: "",
            mode: "REACTION",
            reactions: [{ emoji: "🎉", role_id: "role_1" }],
        });

        expect(result.success).toBe(false);
    });

    it("should REJECT an empty guild id", () => {
        const result = saveReactionMessageInputSchema.safeParse({
            ...validBase(),
            guild_id: "",
            mode: "REACTION",
            reactions: [{ emoji: "🎉", role_id: "role_1" }],
        });

        expect(result.success).toBe(false);
    });
});

describe("reactionMessageSchema", () => {
    it("should coerce the id and apply defaults", () => {
        const parsed = reactionMessageSchema.parse({
            id: "3",
            name: "Verify",
            guild_id: "guild_123",
        });

        expect(parsed.id).toBe(3);
        expect(parsed.mode).toBe("REACTION");
        expect(parsed.content).toBe("");
        expect(parsed.channel_id).toBeUndefined();
        expect(parsed.reactions).toEqual([]);
        expect(parsed.buttons).toEqual([]);
    });

    it("should parse nested reactions and buttons", () => {
        const parsed = reactionMessageSchema.parse({
            id: 1,
            name: "Verify",
            guild_id: "guild_123",
            mode: "BUTTON",
            message: { format: "TEXT", content: "Roles", embed: {} },
            reactions: [{ emoji: "🎉", role_id: "role_1" }],
            buttons: [{ role_id: "role_2", custom_id: "btn_1", style: "SUCCESS" }],
        });

        expect(parsed.reactions[0].role_id).toBe("role_1");
        expect(parsed.buttons[0].style).toBe("SUCCESS");
    });
});
