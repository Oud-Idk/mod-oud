// ticket.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "crypto";
import { signTicket, issueTicket, ticketQuery, type Ticket } from "./ticket";

describe("ticket utilities", () => {
    const TEST_SECRET = "super-secret-test-key-12345";
    const ORIGINAL_ENV = process.env;

    beforeEach(() => {
        // Reset process.env before each test to prevent test pollution
        process.env = { ...ORIGINAL_ENV, INTERNAL_API_SECRET: TEST_SECRET };
    });

    afterEach(() => {
        process.env = ORIGINAL_ENV;
        vi.useRealTimers();
    });

    describe("signTicket", () => {
        it("should generate a valid HMAC-SHA256 signature using the provided secret", () => {
            const guildId = "guild-1";
            const userId = "user-1";
            const expires = 1700000000;
            const purpose = "ws";
            const customSecret = "custom-secret";

            const expectedPayload = `${guildId}:${userId}:${expires.toString()}:${purpose}`;
            const expectedSig = createHmac("sha256", customSecret)
                .update(expectedPayload)
                .digest("hex");

            const sig = signTicket(guildId, userId, expires, purpose, customSecret);

            expect(sig).toBe(expectedSig);
            expect(sig).toMatch(/^[a-f0-9]{64}$/); // 64 hex characters (SHA-256)
        });

        it("should fall back to process.env.INTERNAL_API_SECRET if secret parameter is omitted", () => {
            const guildId = "guild-1";
            const userId = "user-1";
            const expires = 1700000000;
            const purpose = "sse";

            const expectedPayload = `${guildId}:${userId}:${expires.toString()}:${purpose}`;
            const expectedSig = createHmac("sha256", TEST_SECRET)
                .update(expectedPayload)
                .digest("hex");

            const sig = signTicket(guildId, userId, expires, purpose);

            expect(sig).toBe(expectedSig);
        });

        it("should throw an error if no secret is passed and INTERNAL_API_SECRET is not set", () => {
            delete process.env.INTERNAL_API_SECRET;

            expect(() => {
                signTicket("guild-1", "user-1", 1700000000, "ws");
            }).toThrow("INTERNAL_API_SECRET not set");
        });

        it("should throw an error if INTERNAL_API_SECRET is an empty string", () => {
            process.env.INTERNAL_API_SECRET = "";

            expect(() => {
                signTicket("guild-1", "user-1", 1700000000, "ws");
            }).toThrow("INTERNAL_API_SECRET not set");
        });

        it("should produce different signatures for different purposes", () => {
            const sigWs = signTicket("guild-1", "user-1", 1700000000, "ws");
            const sigSse = signTicket("guild-1", "user-1", 1700000000, "sse");

            expect(sigWs).not.toBe(sigSse);
        });
    });

    describe("issueTicket", () => {
        it("should issue a ticket with default 60s TTL", () => {
            const nowMs = 1700000000000; // Epoch ms
            vi.useFakeTimers();
            vi.setSystemTime(nowMs);

            const guildId = "guild-abc";
            const userId = "user-xyz";
            const purpose = "ws";

            const expectedExpires = Math.floor(nowMs / 1000) + 60;
            const expectedSig = signTicket(guildId, userId, expectedExpires, purpose);

            const ticket = issueTicket(guildId, userId, purpose);

            expect(ticket).toEqual({
                guildId,
                userId,
                expires: expectedExpires,
                purpose,
                sig: expectedSig,
            });
        });

        it("should issue a ticket with custom TTL", () => {
            const nowMs = 1700000000000;
            vi.useFakeTimers();
            vi.setSystemTime(nowMs);

            const customTtl = 300; // 5 minutes
            const ticket = issueTicket("guild-abc", "user-xyz", "sse", customTtl);

            expect(ticket.expires).toBe(Math.floor(nowMs / 1000) + customTtl);
            expect(ticket.purpose).toBe("sse");
        });
    });

    describe("ticketQuery", () => {
        it("should format ticket into an encoded URL query string", () => {
            const ticket: Ticket = {
                guildId: "123456789",
                userId: "987654321",
                expires: 1700000060,
                sig: "abcdef1234567890",
                purpose: "ws",
            };

            const query = ticketQuery(ticket);
            const params = new URLSearchParams(query);

            expect(params.get("guild_id")).toBe("123456789");
            expect(params.get("user_id")).toBe("987654321");
            expect(params.get("expires")).toBe("1700000060");
            expect(params.get("sig")).toBe("abcdef1234567890");
            // Rust ticket query does not include `purpose`
            expect(params.has("purpose")).toBe(false);
        });

        it("should properly URL-encode special characters in IDs", () => {
            const ticket: Ticket = {
                guildId: "guild/special & key",
                userId: "user?name=test",
                expires: 1700000060,
                sig: "mock-sig",
                purpose: "sse",
            };

            const query = ticketQuery(ticket);
            const params = new URLSearchParams(query);

            expect(params.get("guild_id")).toBe("guild/special & key");
            expect(params.get("user_id")).toBe("user?name=test");
            expect(query).toContain("guild_id=guild%2Fspecial+%26+key");
        });
    });
});