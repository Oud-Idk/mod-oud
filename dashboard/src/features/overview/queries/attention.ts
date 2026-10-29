import { db } from "@/lib/db";
import { formatDuration, formatRelativeTime } from "../time";
import { AttentionItem, RawAttentionCounts, RawAttentionCountsSchema } from "../types";

/** How far ahead "ending soon" and "expiring soon" look. */
export const ATTENTION_WINDOW_HOURS = 24;

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
    return `${count.toString()} ${count === 1 ? singular : pluralForm}`;
}

/** Keeps only the categories with something in them, in a fixed order. */
export function buildAttentionItems(
    counts: RawAttentionCounts,
    guildId: string,
    now: number = Date.now()
): AttentionItem[] {
    const base = `/dashboard/${guildId}`;
    const items: AttentionItem[] = [];

    if (counts.open_tickets > 0) {
        items.push({
            kind: "OPEN_TICKETS",
            title: plural(counts.open_tickets, "open ticket"),
            detail: counts.oldest_open_ticket_at !== null
                ? `Oldest opened ${formatRelativeTime(counts.oldest_open_ticket_at, now)}`
                : "Waiting for staff",
            href: `${base}/tickets`,
        });
    }

    if (counts.giveaways_ending > 0) {
        items.push({
            kind: "GIVEAWAYS_ENDING",
            title: `${plural(counts.giveaways_ending, "giveaway")} ending soon`,
            detail: counts.next_giveaway_end_at !== null
                ? `Next ends in ${formatDuration(counts.next_giveaway_end_at.getTime() - now)}`
                : `Within ${ATTENTION_WINDOW_HOURS.toString()}h`,
            href: `${base}/giveaways`,
        });
    }

    if (counts.temp_bans_expiring > 0) {
        items.push({
            kind: "TEMP_BANS_EXPIRING",
            title: `${plural(counts.temp_bans_expiring, "temp ban")} expiring soon`,
            detail: counts.next_unban_at !== null
                ? `Next unban in ${formatDuration(counts.next_unban_at.getTime() - now)}`
                : `Within ${ATTENTION_WINDOW_HOURS.toString()}h`,
            href: `${base}/logs`,
        });
    }

    if (counts.failing_reminders > 0) {
        items.push({
            kind: "FAILING_REMINDERS",
            title: `${plural(counts.failing_reminders, "reminder")} failing to send`,
            detail: "Check the channel exists and the bot can post there",
            href: `${base}/reminders`,
        });
    }

    return items;
}

export async function getAttentionItems(guildId: string): Promise<AttentionItem[]> {
    try {
        const result = await db.query(
            `SELECT
                (SELECT COUNT(*) FROM tickets
                  WHERE guild_id = $1 AND status = 'OPEN'::TICKET_STATUS) AS open_tickets,
                (SELECT MIN(created_at) FROM tickets
                  WHERE guild_id = $1 AND status = 'OPEN'::TICKET_STATUS) AS oldest_open_ticket_at,
                (SELECT COUNT(*) FROM giveaways
                  WHERE guild_id = $1 AND is_finished = FALSE
                    AND end_time <= NOW() + make_interval(hours => $2::int)) AS giveaways_ending,
                (SELECT MIN(end_time) FROM giveaways
                  WHERE guild_id = $1 AND is_finished = FALSE
                    AND end_time <= NOW() + make_interval(hours => $2::int)) AS next_giveaway_end_at,
                (SELECT COUNT(*) FROM temp_bans
                  WHERE guild_id = $1
                    AND unban_at <= NOW() + make_interval(hours => $2::int)) AS temp_bans_expiring,
                (SELECT MIN(unban_at) FROM temp_bans
                  WHERE guild_id = $1
                    AND unban_at <= NOW() + make_interval(hours => $2::int)) AS next_unban_at,
                (SELECT COUNT(*) FROM reminders
                  WHERE guild_id = $1 AND is_active = TRUE AND failure_count > 0) AS failing_reminders`,
            [guildId, ATTENTION_WINDOW_HOURS]
        );

        const parsed = RawAttentionCountsSchema.safeParse(result.rows[0]);
        if (!parsed.success) {
            console.error("Failed to parse attention counts:", parsed.error);
            return [];
        }

        return buildAttentionItems(parsed.data, guildId);
    } catch (error) {
        console.error("Failed to fetch attention items:", error);
        return [];
    }
}
