import { db } from "@/lib/db";
import { RecentIncidentItem } from "../types";

interface RawModLog {
    case_id: string;
    action_type: string;
    reason: string | null;
    target_id: string | null;
    target_name: string | null;
    moderator_id: string;
    moderator_name: string | null;
    created_at: Date;
}

interface RawAutoModLog {
    id: string;
    rule_type: string;
    trigger_content: string | null;
    original_content: string | null;
    user_id: string;
    username: string | null;
    created_at: Date;
}

interface RawRaidLog {
    id: string;
    event_type: string;
    details: Record<string, unknown> | null;
    created_at: Date;
}

interface RawTicketLog {
    id: string;
    opener_id: string;
    opener_name: string | null;
    status: string;
    created_at: Date;
}

export async function getRecentIncidents(guildId: string, limit = 6): Promise<RecentIncidentItem[]> {
    try {
        const [modRes, autoRes, raidRes, ticketRes] = await Promise.all([
            db.query<RawModLog>(
                `SELECT m.case_id::TEXT,
                        m.action_type,
                        m.reason,
                        m.target_id::TEXT,
                        COALESCE(t.username, m.target_id::TEXT) AS target_name,
                        m.moderator_id::TEXT,
                        COALESCE(mo.username, m.moderator_id::TEXT) AS moderator_name,
                        m.created_at
                 FROM moderation_logs m
                 LEFT JOIN discord_users t ON t.user_id = m.target_id
                 LEFT JOIN discord_users mo ON mo.user_id = m.moderator_id
                 WHERE m.guild_id = $1
                 ORDER BY m.created_at DESC
                 LIMIT $2`,
                [guildId, limit]
            ),
            db.query<RawAutoModLog>(
                `SELECT a.id::TEXT,
                        a.rule_type,
                        a.trigger_content,
                        a.original_content,
                        a.user_id::TEXT,
                        COALESCE(u.username, a.user_id::TEXT) AS username,
                        a.created_at
                 FROM automod_logs a
                 LEFT JOIN discord_users u ON u.user_id = a.user_id
                 WHERE a.guild_id = $1
                 ORDER BY a.created_at DESC
                 LIMIT $2`,
                [guildId, limit]
            ),
            db.query<RawRaidLog>(
                `SELECT r.id::TEXT,
                        r.event_type::TEXT,
                        r.details,
                        r.created_at
                 FROM raid_event_logs r
                 WHERE r.guild_id = $1
                 ORDER BY r.created_at DESC
                 LIMIT $2`,
                [guildId, limit]
            ),
            db.query<RawTicketLog>(
                `SELECT tk.id::TEXT,
                        tk.opener_id::TEXT,
                        COALESCE(u.username, tk.opener_id::TEXT) AS opener_name,
                        tk.status::TEXT,
                        tk.created_at
                 FROM tickets tk
                 LEFT JOIN discord_users u ON u.user_id = tk.opener_id
                 WHERE tk.guild_id = $1
                 ORDER BY tk.created_at DESC
                 LIMIT $2`,
                [guildId, limit]
            ),
        ]);

        const items: RecentIncidentItem[] = [];

        for (const row of modRes.rows) {
            items.push({
                id: `mod-${row.case_id}`,
                kind: "MODERATION",
                title: `Moderation ${row.action_type}`,
                details: (row.reason !== null && row.reason.trim() !== "") ? row.reason : "No reason specified",
                actor: row.moderator_name,
                target: row.target_name,
                createdAt: new Date(row.created_at),
                href: `/dashboard/${guildId}/logs`,
            });
        }

        for (const row of autoRes.rows) {
            const detailText = (row.trigger_content !== null && row.trigger_content.trim() !== "")
                ? `Trigger: "${row.trigger_content.slice(0, 40)}"`
                : (row.original_content !== null && row.original_content.trim() !== "")
                ? row.original_content.slice(0, 40)
                : "Rule violation caught";

            items.push({
                id: `auto-${row.id}`,
                kind: "AUTOMOD",
                title: `AutoMod ${row.rule_type}`,
                details: detailText,
                actor: "AutoMod",
                target: row.username,
                createdAt: new Date(row.created_at),
                href: `/dashboard/${guildId}/logs`,
            });
        }

        for (const row of raidRes.rows) {
            items.push({
                id: `raid-${row.id}`,
                kind: "RAID",
                title: `Anti-Raid ${row.event_type}`,
                details: "Suspicious join velocity threshold exceeded",
                actor: "Anti-Raid Guard",
                target: null,
                createdAt: new Date(row.created_at),
                href: `/dashboard/${guildId}/anti-raid`,
            });
        }

        for (const row of ticketRes.rows) {
            items.push({
                id: `ticket-${row.id}`,
                kind: "TICKET",
                title: `Support Ticket #${row.id}`,
                details: `Status: ${row.status}`,
                actor: row.opener_name,
                target: null,
                createdAt: new Date(row.created_at),
                href: `/dashboard/${guildId}/tickets`,
            });
        }

        items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return items.slice(0, limit);
    } catch (error) {
        console.error("Failed to fetch recent incidents:", error);
        return [];
    }
}
