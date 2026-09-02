"use server";

import { auth } from "@/lib/auth";
import { issueTicket, type TicketPurpose } from "@/lib/ticket";
import { verifyGuildAccess } from "@/features/_shared/guild";

/**
 * Issues a signed ticket for WS/SSE. Caller must be authenticated and have
 * manage-guild on the target guild. Ticket TTL is 60s and purpose-bound.
 */
export async function issueRealtimeTicketAction(
    guildId: string,
    purpose: TicketPurpose
): Promise<{ userId: string; expires: number; sig: string; guildId: string }> {
    const user = await verifyGuildAccess(guildId);
    const session = await auth();
    // Prefer Discord ID from session, fallback to verifyGuildAccess user.id
    const userId = session?.user.id ?? user.id ?? "";
    if (userId.length === 0) {
        throw new Error("Unauthorized: missing user ID");
    }
    const ticket = issueTicket(guildId, userId, purpose, 60);
    return { userId: ticket.userId, expires: ticket.expires, sig: ticket.sig, guildId };
}
