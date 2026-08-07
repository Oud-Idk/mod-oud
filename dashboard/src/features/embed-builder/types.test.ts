import { describe, it, expect } from "vitest";
import { GuildIdSchema, SendEmbedPayloadSchema, SendEmbedResponseSchema } from "./types";

describe("Embed Builder Schemas", () => {
    describe("GuildIdSchema", () => {
        it("should PASS a valid guild ID", () => {
            const result = GuildIdSchema.safeParse("123456789");
            expect(result.success).toBe(true);
        });

        it("should REJECT an empty guild ID", () => {
            const result = GuildIdSchema.safeParse("");
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe("Guild ID is required");
            }
        });
    });

    describe("SendEmbedPayloadSchema", () => {
        it("should PASS when channelId and a populated embedState are provided", () => {
            const validPayload = {
                channelId: "11223344",
                embedState: {
                    title: "Hello Discord!",
                    description: "This is a valid embed payload.",
                },
            };

            const result = SendEmbedPayloadSchema.safeParse(validPayload);
            expect(result.success).toBe(true);
        });

        it("should REJECT when channelId is missing", () => {
            const invalidPayload = {
                channelId: "",
                embedState: { title: "Title" },
            };

            const result = SendEmbedPayloadSchema.safeParse(invalidPayload);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe("Channel ID is required");
            }
        });

        it("should REJECT an empty embedState (Discord 400 Bad Request prevention)", () => {
            const emptyEmbedPayload = {
                channelId: "11223344",
                embedState: {},
            };

            const result = SendEmbedPayloadSchema.safeParse(emptyEmbedPayload);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe(
                    "Embed must have at least a title, description, or visible content!"
                );
            }
        });
    });

    describe("SendEmbedResponseSchema", () => {
        it("should PASS a successful response object", () => {
            const successData = { success: true, messageId: "msg_999" };
            const result = SendEmbedResponseSchema.safeParse(successData);
            expect(result.success).toBe(true);
        });

        it("should PASS an error response object", () => {
            const errorData = { success: false, error: "Something went wrong" };
            const result = SendEmbedResponseSchema.safeParse(errorData);
            expect(result.success).toBe(true);
        });
    });
});