import { config } from "@/config";
import { issueRealtimeTicketAction } from "@/features/realtime/actions";

/**
 * Builds a ticket-authenticated URL for real-time endpoints.
 * Ticket is `HMAC({guild_id}:{user_id}:{expires}:{purpose}, INTERNAL_API_SECRET)` issued server-side.
 */
export async function buildSseUrl(guildId: string): Promise<string> {
    const ticket = await issueRealtimeTicketAction(guildId, "sse");
    // Use publicBackendUrl for direct Rust SSE (or relative if you proxy via Next).
    // Keep relative path semantics: `/api/sse/events` is routed to Rust via reverse proxy,
    // but we also support absolute URL via publicBackendUrl.
    const base = "/api/sse/events";
    const params = new URLSearchParams({
        guild_id: guildId,
        user_id: ticket.userId,
        expires: String(ticket.expires),
        sig: ticket.sig,
    });
    return `${base}?${params.toString()}`;
}

export async function buildSseAbsoluteUrl(guildId: string): Promise<string> {
    const ticket = await issueRealtimeTicketAction(guildId, "sse");
    const base = `${config.publicBackendUrl}/api/sse/events`;
    const params = new URLSearchParams({
        guild_id: guildId,
        user_id: ticket.userId,
        expires: String(ticket.expires),
        sig: ticket.sig,
    });
    return `${base}?${params.toString()}`;
}
