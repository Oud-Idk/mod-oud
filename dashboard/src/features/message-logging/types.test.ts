import { describe, it, expect } from "vitest";
import {
    messageLoggingConfigSchema,
    deletedMessageSchema,
    editedMessageSchema,
    defaultMessageLoggingConfig,
} from "./types";

describe("messageLoggingConfigSchema", () => {
    it("should apply defaults for an empty object", () => {
        const parsed = messageLoggingConfigSchema.parse({});

        expect(parsed.ignoredChannels).toEqual([]);
        expect(parsed.ignoredRoles).toEqual([]);
        expect(parsed.ignoredUsers).toEqual([]);
        expect(parsed.events).toEqual({ messageDelete: false, messageEdit: false });
    });

    it("should keep provided values", () => {
        const parsed = messageLoggingConfigSchema.parse({
            ignoredChannels: ["chan_1"],
            ignoredRoles: ["role_1"],
            ignoredUsers: ["user_1"],
            events: { messageDelete: true, messageEdit: true },
        });

        expect(parsed.ignoredChannels).toEqual(["chan_1"]);
        expect(parsed.ignoredRoles).toEqual(["role_1"]);
        expect(parsed.ignoredUsers).toEqual(["user_1"]);
        expect(parsed.events).toEqual({ messageDelete: true, messageEdit: true });
    });

    it("should REJECT a non-boolean event value", () => {
        const result = messageLoggingConfigSchema.safeParse({
            events: { messageDelete: "yes", messageEdit: false },
        });

        expect(result.success).toBe(false);
    });
});

describe("defaultMessageLoggingConfig", () => {
    it("should expose the parsed defaults", () => {
        expect(defaultMessageLoggingConfig.events).toEqual({
            messageDelete: false,
            messageEdit: false,
        });
        expect(defaultMessageLoggingConfig.ignoredChannels).toEqual([]);
    });
});

describe("deletedMessageSchema", () => {
    it("should coerce the numeric id and ISO date", () => {
        const parsed = deletedMessageSchema.parse({
            id: "42",
            message_id: "msg_1",
            author_id: "user_1",
            channel_id: "chan_1",
            guild_id: "guild_1",
            content: "hello",
            deleted_at: "2026-01-01T00:00:00.000Z",
        });

        expect(parsed.id).toBe(42);
        expect(parsed.deleted_at).toBe("2026-01-01T00:00:00.000Z");
        expect(parsed.deleted_by_id).toBeNull();
        expect(parsed.attachment_url).toBeNull();
    });

    it("should apply default empty content", () => {
        const parsed = deletedMessageSchema.parse({
            id: 1,
            message_id: "msg_1",
            author_id: "user_1",
            channel_id: "chan_1",
            guild_id: "guild_1",
            deleted_at: new Date("2026-01-01T00:00:00.000Z"),
        });

        expect(parsed.content).toBe("");
        expect(parsed.deleted_at).toBe("2026-01-01T00:00:00.000Z");
    });

    it("should REJECT a missing guild_id", () => {
        const result = deletedMessageSchema.safeParse({
            id: 1,
            message_id: "msg_1",
            author_id: "user_1",
            channel_id: "chan_1",
            deleted_at: "2026-01-01T00:00:00.000Z",
        });

        expect(result.success).toBe(false);
    });
});

describe("editedMessageSchema", () => {
    it("should coerce id and ISO the updated_at date", () => {
        const parsed = editedMessageSchema.parse({
            id: "7",
            message_id: "msg_1",
            author_id: "user_1",
            channel_id: "chan_1",
            guild_id: "guild_1",
            old_content: "before",
            new_content: "after",
            updated_at: "2026-01-01T00:00:00.000Z",
        });

        expect(parsed.id).toBe(7);
        expect(parsed.updated_at).toBe("2026-01-01T00:00:00.000Z");
    });

    it("should default nullish content fields", () => {
        const parsed = editedMessageSchema.parse({
            id: 1,
            message_id: "msg_1",
            author_id: "user_1",
            channel_id: "chan_1",
            guild_id: "guild_1",
            updated_at: new Date("2026-01-01T00:00:00.000Z"),
        });

        expect(parsed.old_content).toBeNull();
        expect(parsed.new_content).toBeNull();
    });

    it("should REJECT a missing author_id", () => {
        const result = editedMessageSchema.safeParse({
            id: 1,
            message_id: "msg_1",
            channel_id: "chan_1",
            guild_id: "guild_1",
            updated_at: "2026-01-01T00:00:00.000Z",
        });

        expect(result.success).toBe(false);
    });
});
