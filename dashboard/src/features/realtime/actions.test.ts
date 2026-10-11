import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";
import { issueRealtimeTicketAction } from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";

// `@/lib/ticket` is deliberately not mocked. The signature is the cross-language
// contract with src/web/ticket.rs, so recomputing the HMAC here is what proves
// the payload layout still matches what Rust verifies.

const mockAuth = vi.hoisted(() => vi.fn());

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
    auth: mockAuth,
}));

const GUILD_ID = "1170276413056745482";
const SECRET = "test-secret-123";

interface MockSession {
    user?: { id?: string };
}

function mockUser(id: string): Awaited<ReturnType<typeof verifyGuildAccess>> {
    return { id, name: "Test User" };
}

function signedIn(id: string): void {
    mockAuth.mockResolvedValue({ user: { id } } satisfies MockSession);
    vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser(id));
}

function denied(message = "Forbidden: You do not have permission to manage this server."): void {
    vi.mocked(verifyGuildAccess).mockRejectedValue(new Error(message));
}

// Independent of lib/ticket, so this asserts the wire format rather than
// re-running the implementation under test. Mirrors verify_ticket in ticket.rs.
function rustCompatibleSig(
    guildId: string,
    userId: string,
    expires: number,
    purpose: string,
    secret: string
): string {
    const payload = `${guildId}:${userId}:${expires.toString()}:${purpose}`;
    return createHmac("sha256", secret).update(payload).digest("hex");
}

describe("issueRealtimeTicketAction", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.stubEnv("INTERNAL_API_SECRET", SECRET);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
    });

    describe("authorization", () => {
        it("should verify guild access before signing anything", async () => {
            signedIn("user_123");

            await issueRealtimeTicketAction(GUILD_ID, "ws");

            expect(verifyGuildAccess).toHaveBeenCalledWith(GUILD_ID);
        });

        it("should NOT issue a ticket when guild access is denied", async () => {
            denied("Forbidden: no manage-guild.");

            await expect(issueRealtimeTicketAction(GUILD_ID, "ws")).rejects.toThrow(
                "Forbidden: no manage-guild."
            );
        });

        it("should NOT call auth when guild access is denied", async () => {
            denied();

            await expect(issueRealtimeTicketAction(GUILD_ID, "sse")).rejects.toThrow();

            expect(mockAuth).not.toHaveBeenCalled();
        });

        it("should require a non-empty user id even after access is granted", async () => {
            mockAuth.mockResolvedValue(null);
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser(""));

            await expect(issueRealtimeTicketAction(GUILD_ID, "ws")).rejects.toThrow(
                "Unauthorized: missing user ID"
            );
        });
    });

    describe("user id resolution", () => {
        it("should prefer the Discord id from the session", async () => {
            signedIn("session_user");
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser("access_user"));

            const ticket = await issueRealtimeTicketAction(GUILD_ID, "ws");

            expect(ticket.userId).toBe("session_user");
        });

        // verifyGuildAccess and auth() both resolve the same session, so this
        // branch is only reachable if the two ever disagree.
        it("should fall back to the user id from verifyGuildAccess when there is no session", async () => {
            mockAuth.mockResolvedValue(null);
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser("access_user"));

            const ticket = await issueRealtimeTicketAction(GUILD_ID, "ws");

            expect(ticket.userId).toBe("access_user");
        });

        // `??` only falls through on null and undefined, so an empty-string id
        // short-circuits the fallback and trips the missing-user check.
        it("should reject an empty-string session id instead of falling back", async () => {
            mockAuth.mockResolvedValue({ user: { id: "" } } satisfies MockSession);
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser("access_user"));

            await expect(issueRealtimeTicketAction(GUILD_ID, "ws")).rejects.toThrow(
                "Unauthorized: missing user ID"
            );
        });

        // `session?.user.id` guards the session, not session.user, so a session
        // carrying no user throws a TypeError rather than reaching the fallback.
        it("should surface a TypeError when the session has no user object", async () => {
            mockAuth.mockResolvedValue({} satisfies MockSession);
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser("access_user"));

            await expect(issueRealtimeTicketAction(GUILD_ID, "ws")).rejects.toThrow(TypeError);
        });
    });

    describe("ticket contents", () => {
        it("should return the guild id, user id, expiry and signature", async () => {
            signedIn("user_123");

            const ticket = await issueRealtimeTicketAction(GUILD_ID, "ws");

            expect(ticket.userId).toBe("user_123");
            expect(ticket.guildId).toBe(GUILD_ID);
            expect(ticket.expires).toBeTypeOf("number");
            expect(ticket.sig).toMatch(/^[0-9a-f]{64}$/);
        });

        // Rust reads purpose from the endpoint it is guarding, so shipping it to
        // the browser would tell the client nothing it does not already know.
        it("should NOT leak the purpose or the ticket guild to the client", async () => {
            signedIn("user_123");

            const ticket = await issueRealtimeTicketAction(GUILD_ID, "ws");

            expect(Object.keys(ticket).sort()).toEqual(["expires", "guildId", "sig", "userId"]);
            expect(ticket).not.toHaveProperty("purpose");
        });

        it("should return the guild id it was asked about", async () => {
            signedIn("user_123");

            const ticket = await issueRealtimeTicketAction("999999999999999999", "sse");

            expect(ticket.guildId).toBe("999999999999999999");
        });
    });

    describe("expiry", () => {
        it("should expire 60 seconds out", async () => {
            signedIn("user_123");
            const before = Math.floor(Date.now() / 1000);

            const ticket = await issueRealtimeTicketAction(GUILD_ID, "ws");

            const after = Math.floor(Date.now() / 1000);
            expect(ticket.expires).toBeGreaterThanOrEqual(before + 60);
            expect(ticket.expires).toBeLessThanOrEqual(after + 60);
        });

        it("should express the expiry in whole unix seconds", async () => {
            signedIn("user_123");

            const ticket = await issueRealtimeTicketAction(GUILD_ID, "ws");

            expect(Number.isInteger(ticket.expires)).toBe(true);
        });

        it("should not issue a ticket that is already expired", async () => {
            signedIn("user_123");

            const ticket = await issueRealtimeTicketAction(GUILD_ID, "ws");

            expect(ticket.expires).toBeGreaterThan(Math.floor(Date.now() / 1000));
        });
    });

    describe("signature contract with ticket.rs", () => {
        it("should sign the guild:user:expires:purpose payload", async () => {
            signedIn("user_123");

            const ticket = await issueRealtimeTicketAction(GUILD_ID, "ws");

            expect(ticket.sig).toBe(
                rustCompatibleSig(GUILD_ID, "user_123", ticket.expires, "ws", SECRET)
            );
        });

        it("should bind an sse ticket to the sse purpose", async () => {
            signedIn("user_123");

            const ticket = await issueRealtimeTicketAction(GUILD_ID, "sse");

            expect(ticket.sig).toBe(
                rustCompatibleSig(GUILD_ID, "user_123", ticket.expires, "sse", SECRET)
            );
        });

        // Mirrors the wrong_purpose_rejects case in ticket.rs: a ticket minted
        // for one transport must not authenticate the other.
        it("should not let a ws ticket verify as an sse ticket", async () => {
            signedIn("user_123");

            const ticket = await issueRealtimeTicketAction(GUILD_ID, "ws");

            expect(ticket.sig).not.toBe(
                rustCompatibleSig(GUILD_ID, "user_123", ticket.expires, "sse", SECRET)
            );
        });

        it("should not let a ticket verify for a different guild", async () => {
            signedIn("user_123");

            const ticket = await issueRealtimeTicketAction(GUILD_ID, "ws");

            expect(ticket.sig).not.toBe(
                rustCompatibleSig("999999999999999999", "user_123", ticket.expires, "ws", SECRET)
            );
        });

        it("should not let a ticket verify for a different user", async () => {
            signedIn("user_123");

            const ticket = await issueRealtimeTicketAction(GUILD_ID, "ws");

            expect(ticket.sig).not.toBe(
                rustCompatibleSig(GUILD_ID, "999999999999999999", ticket.expires, "ws", SECRET)
            );
        });

        it("should not let a ticket verify with a different secret", async () => {
            signedIn("user_123");

            const ticket = await issueRealtimeTicketAction(GUILD_ID, "ws");

            expect(ticket.sig).not.toBe(
                rustCompatibleSig(GUILD_ID, "user_123", ticket.expires, "ws", "another-secret")
            );
        });

        it("should produce a different signature per guild for the same user", async () => {
            signedIn("user_123");

            const first = await issueRealtimeTicketAction(GUILD_ID, "ws");
            const second = await issueRealtimeTicketAction("999999999999999999", "ws");

            expect(first.sig).not.toBe(second.sig);
        });

        // A signature that ignores its expiry would stay valid forever.
        it("should not produce a signature that ignores the expiry", async () => {
            signedIn("user_123");

            const ticket = await issueRealtimeTicketAction(GUILD_ID, "ws");

            expect(ticket.sig).not.toBe(
                rustCompatibleSig(GUILD_ID, "user_123", ticket.expires + 1, "ws", SECRET)
            );
        });
    });

    describe("missing secret", () => {
        it("should propagate the missing-secret error from the ticket signer", async () => {
            signedIn("user_123");
            vi.stubEnv("INTERNAL_API_SECRET", "");

            await expect(issueRealtimeTicketAction(GUILD_ID, "ws")).rejects.toThrow(
                "INTERNAL_API_SECRET not set"
            );
        });

        // Tickets are HMAC'd, so an unset secret must never quietly fall back to
        // a default that both sides could guess.
        it("should not fall back to a default secret when none is configured", async () => {
            signedIn("user_123");
            vi.stubEnv("INTERNAL_API_SECRET", "");

            await expect(issueRealtimeTicketAction(GUILD_ID, "ws")).rejects.toThrow();
        });

        // An unset variable is the realistic deploy failure, and it reaches the
        // signer as undefined rather than as an empty string.
        it("should refuse to sign when the secret is unset entirely", async () => {
            signedIn("user_123");
            vi.stubEnv("INTERNAL_API_SECRET", undefined);

            await expect(issueRealtimeTicketAction(GUILD_ID, "ws")).rejects.toThrow(
                "INTERNAL_API_SECRET not set"
            );
        });

        it("should refuse to sign rather than use a built-in secret when unset", async () => {
            signedIn("user_123");
            vi.stubEnv("INTERNAL_API_SECRET", undefined);

            await expect(issueRealtimeTicketAction(GUILD_ID, "ws")).rejects.toThrow();
        });
    });
});