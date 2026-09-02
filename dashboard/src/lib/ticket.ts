import { createHmac } from "crypto";

/**
 * Ticket helpers — mirrors `src/web/ticket.rs`.
 * Payload: "{guildId}:{userId}:{expires}:{purpose}" where purpose is "ws" or "sse".
 * sig = hex(HMAC-SHA256(payload, INTERNAL_API_SECRET))
 */

export type TicketPurpose = "ws" | "sse";

export interface Ticket {
    guildId: string;
    userId: string;
    expires: number;
    sig: string;
    purpose: TicketPurpose;
}

function getSecret(): string {
    const secret = process.env.INTERNAL_API_SECRET ?? "";
    if (secret.length === 0) {
        throw new Error("INTERNAL_API_SECRET not set");
    }
    return secret;
}

export function signTicket(
    guildId: string,
    userId: string,
    expires: number,
    purpose: TicketPurpose,
    secret?: string
): string {
    const s = secret ?? getSecret();
    const payload = `${guildId}:${userId}:${expires.toString()}:${purpose}`;
    return createHmac("sha256", s).update(payload).digest("hex");
}

/**
 * Issues a short-lived ticket (default 60s). Call from server actions only,
 * after `verifyGuildAccess` + `auth()` so the browser never sees the secret.
 */
export function issueTicket(
    guildId: string,
    userId: string,
    purpose: TicketPurpose,
    ttlSeconds = 60
): Ticket {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sig = signTicket(guildId, userId, expires, purpose);
    return { guildId, userId, expires, sig, purpose };
}

/**
 * Builds query string for Rust ticket verification: ?guild_id=...&user_id=...&expires=...&sig=...
 * Rust expects `guild_id` separately, so we return ticket fields without guildId duplication.
 */
export function ticketQuery(ticket: Ticket): string {
    const params = new URLSearchParams({
        guild_id: ticket.guildId,
        user_id: ticket.userId,
        expires: String(ticket.expires),
        sig: ticket.sig,
    });
    return params.toString();
}
