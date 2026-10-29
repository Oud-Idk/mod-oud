import { db } from "@/lib/db";
import { buildFeatureCategories } from "../featureMatrix";
import { FeatureMatrixCategory } from "../types";

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
        const verification = isObj(settings.verification) ? settings.verification : null;
        const leave = isObj(settings.leave) ? settings.leave : null;

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
