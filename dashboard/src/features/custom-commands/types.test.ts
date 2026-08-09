import { describe, it, expect } from "vitest";
import { SaveCustomCommandSchema } from "./types";

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
            expect(result.data.allowed_roles).toEqual([]);
            expect(result.data.ignored_roles).toEqual([]);
            expect(result.data.actions).toEqual([]);
        }
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
});