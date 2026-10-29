export { getRecentIncidents } from "./incidents";
import { db } from "@/lib/db";
import { backendFetch } from "@/lib/backend";
import { buildFeatureCategories } from "./featureMatrix";
import {
    FeatureMatrixCategory,
    DiscordGuildDetails,
    DiscordGuildDetailsSchema,
    GuildStats,
    RawGuildStatsSchema,
    TelemetryReport,
    TelemetryReportSchema,
} from "@/features/overview/types";

const DEFAULT_STATS: GuildStats = {
    weeklyModerationCount: 0,
    weeklyResolvedTicketCount: 0,
    openTicketsCount: 0,
};

export async function getGuildStats(guildId: string): Promise<GuildStats> {
    try {
        const query = `
            SELECT (SELECT COUNT(*)
                    FROM moderation_logs
                    WHERE created_at >= NOW() - INTERVAL '7 days'
                      AND guild_id = $1)                    AS weekly_moderation,
                   (SELECT COUNT(*)
                    FROM tickets
                    WHERE guild_id = $1
                      AND status = 'CLOSED'::TICKET_STATUS) AS weekly_resolved,
                   (SELECT COUNT(*)
                    FROM tickets
                    WHERE guild_id = $1
                      AND status = 'OPEN'::TICKET_STATUS)   AS open_tickets;
        `;

        const result = await db.query(query, [guildId]);
        if (result.rows.length === 0) return DEFAULT_STATS;

        // Validate & transform the raw row
        const parsed = RawGuildStatsSchema.safeParse(result.rows[0]);
        if (!parsed.success) {
            console.error("Failed to parse DB stats row:", parsed.error);
            return DEFAULT_STATS;
        }

        return {
            weeklyModerationCount: parsed.data.weekly_moderation,
            weeklyResolvedTicketCount: parsed.data.weekly_resolved,
            openTicketsCount: parsed.data.open_tickets,
        };
    } catch (error) {
        console.error("Database error fetching guild stats:", error);
        return DEFAULT_STATS;
    }
}

export async function getGuildDetails(guildId: string): Promise<DiscordGuildDetails | null> {
    const botToken = process.env.DISCORD_TOKEN;
    if (botToken === undefined || botToken.trim() === "") {
        return null;
    }

    try {
        const response = await fetch(
            `https://discord.com/api/v10/guilds/${guildId}?with_counts=true`,
            {
                headers: { Authorization: `Bot ${botToken}` },
                next: { revalidate: 30 },
            }
        );

        if (!response.ok) return null;

        const rawData: unknown = await response.json();

        const result = DiscordGuildDetailsSchema.safeParse(rawData);
        if (!result.success) {
            console.error("Invalid Discord Guild structure:", result.error);
            return null;
        }

        return result.data;
    } catch (error) {
        console.error("Failed to fetch guild details:", error);
        return null;
    }
}

export async function getTelemetry(): Promise<TelemetryReport | null> {
    try {
        const response = await backendFetch("/api/telemetry", {
            signal: AbortSignal.timeout(2000),
        });

        if (!response.ok) return null;

        const rawData: unknown = await response.json();
        const parsed = TelemetryReportSchema.safeParse(rawData);
        if (!parsed.success) {
            console.error("Failed to parse telemetry data:", parsed.error);
            return null;
        }

        return parsed.data;
    } catch {
        return null;
    }
}


interface RawGuildSettingsRow {
    settings: Record<string, unknown> | null;
}

interface RawFeatureCounts {
    custom_commands: string | number;
    starboards: string | number;
    reaction_roles: string | number;
    reminders: string | number;
    media_only: string | number;
    temp_voice: string | number;
    giveaways: string | number;
    rss_feeds: string | number;
}

export async function getGuildFeatureMatrix(guildId: string): Promise<FeatureMatrixCategory[]> {
    try {
        const [settingsRes, countsRes] = await Promise.all([
            db.query<RawGuildSettingsRow>(
                `SELECT settings FROM guild_configs WHERE guild_id = $1`,
                [guildId]
            ),
            db.query<RawFeatureCounts>(
                `SELECT
                    (SELECT COUNT(*) FROM custom_commands WHERE guild_id = $1) AS custom_commands,
                    (SELECT COUNT(*) FROM starboards WHERE guild_id = $1) AS starboards,
                    (SELECT COUNT(*) FROM reaction_messages WHERE guild_id = $1) AS reaction_roles,
                    (SELECT COUNT(*) FROM reminders WHERE guild_id = $1) AS reminders,
                    (SELECT COUNT(*) FROM media_only_channels WHERE guild_id = $1) AS media_only,
                    (SELECT COUNT(*) FROM temp_voice_hubs WHERE guild_id = $1) AS temp_voice,
                    (SELECT COUNT(*) FROM giveaways WHERE guild_id = $1) AS giveaways,
                    (SELECT COUNT(*) FROM channel_subscriptions WHERE guild_id = $1) AS rss_feeds
                `,
                [guildId]
            ),
        ]);

        const settings = settingsRes.rows[0]?.settings ?? {};
        const counts = countsRes.rows[0] ?? {
            custom_commands: 0,
            starboards: 0,
            reaction_roles: 0,
            reminders: 0,
            media_only: 0,
            temp_voice: 0,
            giveaways: 0,
            rss_feeds: 0,
        };

        const num = (v: string | number | undefined): number => {
            const parsed = Number(v);
            return Number.isNaN(parsed) ? 0 : parsed;
        };

        const isObj = (v: unknown): v is Record<string, unknown> =>
            typeof v === "object" && v !== null;

        const mf = isObj(settings.message_filtering) ? settings.message_filtering : {};
        const mfEnabled = Object.values(mf).some(
            (rule) => isObj(rule) && rule.enabled === true
        );
        const mfActiveCount = Object.values(mf).filter(
            (rule) => isObj(rule) && rule.enabled === true
        ).length;

        const dynSlowmode = isObj(settings.dynamic_slowmode) ? settings.dynamic_slowmode : null;
        const honeypot = isObj(settings.honeypot) ? settings.honeypot : null;
        const report = isObj(settings.report) ? settings.report : null;
        const antiRaid = isObj(settings.raid_detection) ? settings.raid_detection : null;
        const msgLogging = isObj(settings.message_logging) ? settings.message_logging : null;
        const modDms = isObj(settings.moderation_dms) ? settings.moderation_dms : null;
        const leveling = isObj(settings.leveling) ? settings.leveling : null;
        const economy = isObj(settings.economy) ? settings.economy : null;
        const gambling = isObj(settings.gambling) ? settings.gambling : null;
        const birthday = isObj(settings.birthday) ? settings.birthday : null;
        const memberCounter = isObj(settings.member_counter) ? settings.member_counter : null;
        const tickets = isObj(settings.tickets) ? settings.tickets : null;
        const inviteTracking = isObj(settings.invite_tracker) ? settings.invite_tracker : null;
        const welcome = isObj(settings.welcome) ? settings.welcome : null;
        const leave = isObj(settings.leave) ? settings.leave : null;
        const verification = isObj(settings.verification) ? settings.verification : null;

        return buildFeatureCategories({
            guildId,
            mfEnabled,
            mfActiveCount,
            antiRaidEnabled: antiRaid?.enabled === true,
            dynSlowmodeEnabled: dynSlowmode?.enabled === true,
            honeypotEnabled: honeypot?.enabled === true,
            reportEnabled: report?.enabled === true,
            msgLoggingEnabled: msgLogging?.enabled === true,
            modDmsEnabled: modDms !== null && Object.values(modDms).some((val) => isObj(val) && val.enabled === true),
            levelingEnabled: leveling?.enabled === true,
            starboardsCount: num(counts.starboards),
            reactionRolesCount: num(counts.reaction_roles),
            giveawaysCount: num(counts.giveaways),
            economyEnabled: economy?.enabled === true,
            gamblingEnabled: gambling?.enabled === true,
            birthdayEnabled: birthday?.enabled === true,
            customCmdsCount: num(counts.custom_commands),
            ticketsEnabled: typeof tickets?.channel_id === "string" || typeof tickets?.category_id === "string",
            memberCounterEnabled: memberCounter?.enabled === true,
            remindersCount: num(counts.reminders),
            rssCount: num(counts.rss_feeds),
            tempVoiceCount: num(counts.temp_voice),
            mediaOnlyCount: num(counts.media_only),
            inviteTrackingEnabled: inviteTracking?.enabled === true,
            welcomeEnabled: welcome?.enabled === true,
            verificationEnabled: verification?.enabled === true,
            leaveEnabled: leave?.enabled === true,
        });
    } catch (error) {
        console.error("Failed to fetch guild feature matrix:", error);
        return [];
    }
}
