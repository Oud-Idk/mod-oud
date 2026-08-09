import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
    reactionRoleModeSchema,
    buttonStyleSchema,
    reactionRoleItemSchema,
    buttonRoleItemSchema,
    saveReactionMessageInputSchema,
    reactionMessageSchema,
} from "./types";
import { MessageLayout } from "@/features/_shared/embed";

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
    function validBase(): {name: string, guild_id: string, channel_id: string, message: MessageLayout} {
        return {
            name: "Verify",
            guild_id: "guild_123",
            channel_id: "chan_1",
            message: { format: "TEXT" as const, content: "Pick a role", embed: {} },
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

    // Kills Schema Default Mutants (reactions, buttons, mode)
    it("should apply defaults for omitted fields in input schema", () => {
        const result = saveReactionMessageInputSchema.safeParse({
            name: "Verify",
            guild_id: "guild_123",
            channel_id: "chan_1",
            reactions: [{ emoji: "🎉", role_id: "role_1" }],
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.mode).toBe("REACTION");
            expect(result.data.buttons).toEqual([]);
        }
    });

    // Kills channel_id message & path mutants
    it("should REJECT a missing or whitespace channel_id with exact issue", () => {
        const resultMissing = saveReactionMessageInputSchema.safeParse({
            ...validBase(),
            channel_id: undefined,
            reactions: [{ emoji: "🎉", role_id: "role_1" }],
        });

        expect(resultMissing.success).toBe(false);
        if (!resultMissing.success) {
            expect(resultMissing.error.issues).toContainEqual({
                code: z.ZodIssueCode.custom,
                message: "Please select a target channel.",
                path: ["channel_id"],
            });
        }

        // Kills .trim() / whitespace mutant
        const resultWhitespace = saveReactionMessageInputSchema.safeParse({
            ...validBase(),
            channel_id: "   ",
            reactions: [{ emoji: "🎉", role_id: "role_1" }],
        });
        expect(resultWhitespace.success).toBe(false);
    });

    it("should REJECT a REACTION message with no mappings", () => {
        const result = saveReactionMessageInputSchema.safeParse({
            ...validBase(),
            mode: "REACTION",
            reactions: [],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toContainEqual({
                code: z.ZodIssueCode.custom,
                message: "At least one reaction mapping is required.",
                path: ["reactions"],
            });
        }
    });

    // Kills emoji error message, index math (index + 1), and full path mutants
    it("should REJECT a reaction missing or whitespace emoji with exact issue", () => {
        const result = saveReactionMessageInputSchema.safeParse({
            ...validBase(),
            mode: "REACTION",
            reactions: [{ emoji: "", role_id: "role_1" }],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toContainEqual({
                code: z.ZodIssueCode.custom,
                message: "Reaction #1 requires an emoji.",
                path: ["reactions", 0, "emoji"],
            });
        }

        // Kills .trim() whitespace mutant
        const resultSpace = saveReactionMessageInputSchema.safeParse({
            ...validBase(),
            mode: "REACTION",
            reactions: [{ emoji: "   ", role_id: "role_1" }],
        });
        expect(resultSpace.success).toBe(false);
    });

    // Kills reaction role_id error message, index math, and path mutants
    it("should REJECT a reaction missing or whitespace role with exact issue", () => {
        const result = saveReactionMessageInputSchema.safeParse({
            ...validBase(),
            mode: "REACTION",
            reactions: [{ emoji: "🎉", role_id: null }],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toContainEqual({
                code: z.ZodIssueCode.custom,
                message: "Reaction #1 requires an assigned role.",
                path: ["reactions", 0, "role_id"],
            });
        }

        // Kills .trim() whitespace mutant
        const resultSpace = saveReactionMessageInputSchema.safeParse({
            ...validBase(),
            mode: "REACTION",
            reactions: [{ emoji: "🎉", role_id: "   " }],
        });
        expect(resultSpace.success).toBe(false);
    });

    it("should REJECT a BUTTON message with no mappings", () => {
        const result = saveReactionMessageInputSchema.safeParse({
            ...validBase(),
            mode: "BUTTON",
            buttons: [],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toContainEqual({
                code: z.ZodIssueCode.custom,
                message: "At least one button mapping is required.",
                path: ["buttons"],
            });
        }
    });

    // Kills button role_id error message, index math, and path mutants
    it("should REJECT a button missing or whitespace role with exact issue", () => {
        const result = saveReactionMessageInputSchema.safeParse({
            ...validBase(),
            mode: "BUTTON",
            buttons: [{ role_id: "", custom_id: "btn_1" }],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toContainEqual({
                code: z.ZodIssueCode.custom,
                message: "Button #1 requires an assigned role.",
                path: ["buttons", 0, "role_id"],
            });
        }

        // Kills .trim() whitespace mutant
        const resultSpace = saveReactionMessageInputSchema.safeParse({
            ...validBase(),
            mode: "BUTTON",
            buttons: [{ role_id: "   ", custom_id: "btn_1" }],
        });
        expect(resultSpace.success).toBe(false);
    });

    it("should REJECT an empty name with exact error message", () => {
        const result = saveReactionMessageInputSchema.safeParse({
            ...validBase(),
            name: "",
            mode: "REACTION",
            reactions: [{ emoji: "🎉", role_id: "role_1" }],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Name is required");
        }
    });

    it("should REJECT an empty guild_id with exact error message", () => {
        const result = saveReactionMessageInputSchema.safeParse({
            ...validBase(),
            guild_id: "",
            mode: "REACTION",
            reactions: [{ emoji: "🎉", role_id: "role_1" }],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Guild ID is required");
        }
    });
});

describe("reactionMessageSchema", () => {
    it("should coerce the id and apply defaults when fields are omitted", () => {
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

        // Kills messageLayoutSchema defaults mutants (format, content, embed)
        expect(parsed.message.format).toBe("EMBED");
        expect(parsed.message.content).toBe(
            "Please complete the verification below to gain access to the server."
        );
        expect(parsed.message.embed).toEqual({});
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