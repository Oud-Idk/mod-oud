import { describe, it, expect } from "vitest";
import {
    SaveCustomCommandSchema,
    commandActionSchema,
    cooldownTypeSchema,
    customCommandSchema,
    customPrefixSchema,
} from "./types";

describe("Custom Commands Schemas", () => {
    it("should REJECT command names with spaces or special characters", () => {
        const invalid = {
            guild_id: "guild_123",
            name: "my command!", // ❌ Spaces & exclamation mark illegal in Discord!
            actions: [{ type: "add_role", data: { role_id: "role_1" } }],
        };

        const result = SaveCustomCommandSchema.safeParse(invalid);
        expect(result.success).toBe(false);
    });

    it("should REJECT command when enabled = true but has 0 actions", () => {
        const invalid = {
            guild_id: "guild_123",
            name: "testcommand",
            enabled: true,
            actions: [],
        };

        const result = SaveCustomCommandSchema.safeParse(invalid);
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe(
                "At least one action is required for a custom command!"
            );
            // Exact issue metadata, so a wrong code or path fails the suite.
            expect(result.error.issues[0].code).toBe("custom");
            expect(result.error.issues[0].path).toEqual(["actions"]);
        }
    });

    it("should REJECT a name with a leading illegal character even when the tail is valid", () => {
        // The anchor requires the whole name to match, so a valid tail must not save it.
        const result = SaveCustomCommandSchema.safeParse({
            guild_id: "guild_123",
            name: "has space",
            enabled: false,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe(
                "Name can only contain letters, numbers, hyphens, and underscores"
            );
        }
    });

    it("should REJECT an empty command name with the required message", () => {
        const result = SaveCustomCommandSchema.safeParse({
            guild_id: "guild_123",
            name: "",
            enabled: false,
        });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Command name is required");
        }
    });

    it("should PASS when valid name and actions are provided", () => {
        const valid = {
            guild_id: "guild_123",
            name: "test-command_1",
            enabled: true,
            actions: [
                {
                    type: "add_role",
                    data: { role_id: "role_999" },
                },
            ],
        };

        const result = SaveCustomCommandSchema.safeParse(valid);
        expect(result.success).toBe(true);
    });

    it("should PASS when enabled = false and actions is empty", () => {
        const valid = {
            guild_id: "guild_123",
            name: "disabled-cmd",
            enabled: false,
            actions: [],
        };

        const result = SaveCustomCommandSchema.safeParse(valid);

        expect(result.success).toBe(true);
    });

    it("should apply default values when optional fields are omitted", () => {
        const minimal = {
            guild_id: "guild_123",
            name: "defaults-cmd",
            enabled: false,
        };

        const result = SaveCustomCommandSchema.safeParse(minimal);

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.enabled).toBe(false);
            expect(result.data.cooldown_type).toBe("NONE");
            expect(result.data.cooldown_seconds).toBe(0);
            expect(result.data.trigger_anywhere).toBe(false);
            expect(result.data.allowed_roles).toEqual([]);
            expect(result.data.ignored_roles).toEqual([]);
            expect(result.data.actions).toEqual([]);
        }
    });

    it("should default enabled to true and the remaining fields to their inert values", () => {
        // Enabled defaults to true, so an action is required to pass strict validation.
        const result = SaveCustomCommandSchema.safeParse({
            guild_id: "guild_123",
            name: "bare-defaults",
            actions: [{ type: "add_role", data: { role_id: "role_1" } }],
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.enabled).toBe(true);
            expect(result.data.description).toBe("");
            expect(result.data.delete_trigger).toBe(false);
            expect(result.data.allowed_channels).toEqual([]);
            expect(result.data.ignored_channels).toEqual([]);
        }
    });

    describe("cooldownTypeSchema", () => {
        it("should PASS every documented cooldown type", () => {
            expect(cooldownTypeSchema.safeParse("NONE").success).toBe(true);
            expect(cooldownTypeSchema.safeParse("USER").success).toBe(true);
            expect(cooldownTypeSchema.safeParse("SERVER").success).toBe(true);
        });

        it("should REJECT an empty cooldown type", () => {
            expect(cooldownTypeSchema.safeParse("").success).toBe(false);
        });
    });

    describe("customCommandSchema", () => {
        it("should REJECT a row without an id", () => {
            expect(customCommandSchema.safeParse({ guild_id: "guild_123", name: "no-id" }).success).toBe(
                false
            );
        });

        it("should PASS a row with an id", () => {
            expect(
                customCommandSchema.safeParse({ id: 7, guild_id: "guild_123", name: "has-id" }).success
            ).toBe(true);
        });
    });

    describe("commandActionSchema", () => {
        it("should PASS one action of every documented type", () => {
            const layout = { messages: [{ format: "TEXT", content: "hi" }] };
            expect(
                commandActionSchema.safeParse({
                    type: "send_channel_message",
                    data: { channel_id: "chan_1", message_layout: layout },
                }).success
            ).toBe(true);
            expect(
                commandActionSchema.safeParse({
                    type: "respond_current_channel",
                    data: { message_layout: layout },
                }).success
            ).toBe(true);
            expect(
                commandActionSchema.safeParse({ type: "add_role", data: { role_id: "role_1" } }).success
            ).toBe(true);
            expect(
                commandActionSchema.safeParse({ type: "remove_role", data: { role_id: "role_1" } })
                    .success
            ).toBe(true);
        });
    });

    it("should REJECT negative cooldown_seconds", () => {
        const invalid = {
            guild_id: "guild_123",
            name: "negative-cooldown",
            enabled: false,
            cooldown_seconds: -5,
        };

        const result = SaveCustomCommandSchema.safeParse(invalid);

        expect(result.success).toBe(false);
    });

    it("should coerce a string id to a number", () => {
        const withStringId = {
            id: "42",
            guild_id: "guild_123",
            name: "coerced-id",
            enabled: false,
        };

        const result = SaveCustomCommandSchema.safeParse(withStringId);

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.id).toBe(42);
        }
    });

    describe("commandActionSchema variants", () => {
        it("should PASS a valid send_channel_message action", () => {
            const valid = {
                guild_id: "guild_123",
                name: "send-msg-cmd",
                enabled: true,
                actions: [
                    {
                        type: "send_channel_message",
                        data: {
                            channel_id: "chan_1",
                            message_layout: {
                                messages: [
                                    { enabled: true, format: "TEXT", content: "hello" },
                                ],
                            },
                        },
                    },
                ],
            };

            const result = SaveCustomCommandSchema.safeParse(valid);

            expect(result.success).toBe(true);
        });

        it("should REJECT a TEXT-format message with empty content when enabled", () => {
            const invalid = {
                guild_id: "guild_123",
                name: "empty-text-cmd",
                enabled: true,
                actions: [
                    {
                        type: "respond_current_channel",
                        data: {
                            message_layout: {
                                messages: [
                                    { enabled: true, format: "TEXT", content: "" },
                                ],
                            },
                        },
                    },
                ],
            };

            const result = SaveCustomCommandSchema.safeParse(invalid);

            expect(result.success).toBe(false);
        });

        it("should PASS a valid TEXT-format message in message_layout", () => {
            const valid = {
                guild_id: "guild_123",
                name: "disabled-layout-cmd",
                enabled: true,
                actions: [
                    {
                        type: "respond_current_channel",
                        data: {
                            message_layout: {
                                messages: [
                                    { format: "TEXT", content: "Hello world!" },
                                ],
                            },
                        },
                    },
                ],
            };

            const result = SaveCustomCommandSchema.safeParse(valid);

            expect(result.success).toBe(true);
        });

        it("should REJECT an EMBED-format message with an empty embed when enabled", () => {
            const invalid = {
                guild_id: "guild_123",
                name: "empty-embed-cmd",
                enabled: true,
                actions: [
                    {
                        type: "respond_current_channel",
                        data: {
                            message_layout: {
                                messages: [
                                    { enabled: true, format: "EMBED", embed: {} },
                                ],
                            },
                        },
                    },
                ],
            };

            const result = SaveCustomCommandSchema.safeParse(invalid);

            expect(result.success).toBe(false);
        });

        it("should REJECT send_channel_message with zero messages", () => {
            const invalid = {
                guild_id: "guild_123",
                name: "send-msg-cmd",
                enabled: true,
                actions: [
                    {
                        type: "send_channel_message",
                        data: {
                            channel_id: "chan_1",
                            message_layout: { messages: [] },
                        },
                    },
                ],
            };

            const result = SaveCustomCommandSchema.safeParse(invalid);

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe("At least one message is required");
            }
        });

        it("should PASS a valid respond_current_channel action with defaults", () => {
            const valid = {
                guild_id: "guild_123",
                name: "respond-cmd",
                enabled: true,
                actions: [
                    {
                        type: "respond_current_channel",
                        data: {
                            message_layout: {
                                messages: [
                                    { enabled: true, format: "TEXT", content: "hi" },
                                ],
                            },
                        },
                    },
                ],
            };

            const result = SaveCustomCommandSchema.safeParse(valid);

            expect(result.success).toBe(true);
            if (result.success) {
                const action = result.data.actions[0];
                if (action.type === "respond_current_channel") {
                    expect(action.data.is_dm).toBe(false);
                    expect(action.data.is_ephemeral).toBe(false);
                    expect(action.data.message_layout.randomize).toBe(false);
                }
            }
        });

        it("should PASS a valid remove_role action", () => {
            const valid = {
                guild_id: "guild_123",
                name: "remove-role-cmd",
                enabled: true,
                actions: [{ type: "remove_role", data: { role_id: "role_1" } }],
            };

            const result = SaveCustomCommandSchema.safeParse(valid);

            expect(result.success).toBe(true);
        });

        it("should REJECT remove_role with empty role_id", () => {
            const invalid = {
                guild_id: "guild_123",
                name: "remove-role-cmd",
                enabled: true,
                actions: [{ type: "remove_role", data: { role_id: "" } }],
            };

            const result = SaveCustomCommandSchema.safeParse(invalid);

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe("Role is required");
            }
        });

        it("should REJECT send_channel_message with empty channel_id", () => {
            const invalid = {
                guild_id: "guild_123",
                name: "send-msg-cmd",
                enabled: true,
                actions: [
                    {
                        type: "send_channel_message",
                        data: {
                            channel_id: "",
                            message_layout: { messages: [{ format: "TEXT", content: "hello" }] },
                        },
                    },
                ],
            };

            const result = SaveCustomCommandSchema.safeParse(invalid);

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe("Target channel is required");
            }
        });

        it("should REJECT add_role with empty role_id", () => {
            const invalid = {
                guild_id: "guild_123",
                name: "add-role-cmd",
                enabled: true,
                actions: [{ type: "add_role", data: { role_id: "" } }],
            };

            const result = SaveCustomCommandSchema.safeParse(invalid);

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe("Role is required");
            }
        });

        it("should REJECT an unknown action type", () => {
            const invalid = {
                guild_id: "guild_123",
                name: "unknown-action-cmd",
                enabled: true,
                actions: [{ type: "delete_everything", data: {} }],
            };

            const result = SaveCustomCommandSchema.safeParse(invalid);

            expect(result.success).toBe(false);
        });
    });

    describe("customPrefixSchema", () => {
        it("should ACCEPT common symbol prefixes", () => {
            for (const prefix of ["!", "?", ".", "-", "+", "$", "%", "!!", "!?"]) {
                expect(customPrefixSchema.safeParse({ prefix }).success).toBe(true);
            }
        });

        it("should trim surrounding whitespace before validating", () => {
            // Without trim the padding trips the whitespace rule.
            const result = customPrefixSchema.safeParse({ prefix: " ? " });
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.prefix).toBe("?");
            }
        });

        it("should default to ! when empty object is given", () => {
            const result = customPrefixSchema.safeParse({});
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.prefix).toBe("!");
            }
        });

        it("should REJECT empty, long, alphanumeric, whitespace, or forbidden prefixes", () => {
            expect(customPrefixSchema.safeParse({ prefix: "" }).success).toBe(false);
            expect(customPrefixSchema.safeParse({ prefix: "!!!!" }).success).toBe(false);
            expect(customPrefixSchema.safeParse({ prefix: "! cmd" }).success).toBe(false);
            expect(customPrefixSchema.safeParse({ prefix: "a" }).success).toBe(false);
            expect(customPrefixSchema.safeParse({ prefix: "1" }).success).toBe(false);
            for (const bad of ["<", ">", "@", "#", "`", "/"]) {
                expect(customPrefixSchema.safeParse({ prefix: bad }).success).toBe(false);
            }
        });

        it("should report the exact reason for each rejected prefix", () => {
            const empty = customPrefixSchema.safeParse({ prefix: "" });
            expect(empty.success).toBe(false);
            if (!empty.success) {
                expect(empty.error.issues[0].message).toBe("Prefix must not be empty.");
            }

            const long = customPrefixSchema.safeParse({ prefix: "!!!!" });
            expect(long.success).toBe(false);
            if (!long.success) {
                expect(long.error.issues[0].message).toBe("Prefix must be at most 3 characters.");
            }

            // Internal space survives trim, so only the whitespace rule fires.
            const spaced = customPrefixSchema.safeParse({ prefix: "! !" });
            expect(spaced.success).toBe(false);
            if (!spaced.success) {
                const messages = spaced.error.issues.map((issue) => issue.message);
                expect(messages).toContain("Prefix must not contain whitespace.");
            }

            const forbidden = customPrefixSchema.safeParse({ prefix: "<" });
            expect(forbidden.success).toBe(false);
            if (!forbidden.success) {
                expect(forbidden.error.issues[0].message).toBe(
                    "Prefix must not contain <, >, @, #, ` or /."
                );
            }
        });
    });
});