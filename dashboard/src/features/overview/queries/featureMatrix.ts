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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function parseCount(value: string | number | undefined): number {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function isSectionEnabled(value: unknown): boolean {
    return isRecord(value) && value.enabled === true;
}

function parseMessageFiltering(value: unknown): { enabled: boolean; activeCount: number } {
    if (!isRecord(value)) {
        return { enabled: false, activeCount: 0 };
    }

    const rules = Object.values(value);
    return {
        enabled: rules.some(isSectionEnabled),
        activeCount: rules.filter(isSectionEnabled).length,
    };
}

function isModDmsEnabled(value: unknown): boolean {
    if (!isRecord(value)) {
        return false;
    }
    return Object.values(value).some(isSectionEnabled);
}

function isTicketsEnabled(value: unknown): boolean {
    if (!isRecord(value)) {
        return false;
    }
    return typeof value.channel_id === "string" || typeof value.category_id === "string";
}

const DEFAULT_FEATURE_COUNTS: RawFeatureCounts = {
    custom_commands: 0,
    starboards: 0,
    reaction_roles: 0,
    reminders: 0,
    media_only: 0,
    temp_voice: 0,
    giveaways: 0,
    rss_feeds: 0,
};

async function fetchGuildSettings(guildId: string): Promise<Record<string, unknown>> {
    const res = await db.query<RawGuildSettingsRow>(
        `SELECT settings FROM guild_configs WHERE guild_id = $1`,
        [guildId]
    );

    const settings = res.rows[0]?.settings;
    return isRecord(settings) ? settings : {};
}

async function fetchFeatureCounts(guildId: string): Promise<RawFeatureCounts> {
    const res = await db.query<RawFeatureCounts>(
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
    );

    return res.rows[0] ?? DEFAULT_FEATURE_COUNTS;
}

export async function getGuildFeatureMatrix(guildId: string): Promise<FeatureMatrixCategory[]> {
    try {
        const [settings, counts] = await Promise.all([
            fetchGuildSettings(guildId),
            fetchFeatureCounts(guildId),
        ]);

        const mf = parseMessageFiltering(settings.message_filtering);

        return buildFeatureCategories({
            guildId,
            mfEnabled: mf.enabled,
            mfActiveCount: mf.activeCount,
            antiRaidEnabled: isSectionEnabled(settings.raid_detection),
            dynSlowmodeEnabled: isSectionEnabled(settings.dynamic_slowmode),
            honeypotEnabled: isSectionEnabled(settings.honeypot),
            reportEnabled: isSectionEnabled(settings.report),
            msgLoggingEnabled: isSectionEnabled(settings.message_logging),
            modDmsEnabled: isModDmsEnabled(settings.moderation_dms),
            levelingEnabled: isSectionEnabled(settings.leveling),
            starboardsCount: parseCount(counts.starboards),
            reactionRolesCount: parseCount(counts.reaction_roles),
            giveawaysCount: parseCount(counts.giveaways),
            economyEnabled: isSectionEnabled(settings.economy),
            gamblingEnabled: isSectionEnabled(settings.gambling),
            birthdayEnabled: isSectionEnabled(settings.birthday),
            customCmdsCount: parseCount(counts.custom_commands),
            ticketsEnabled: isTicketsEnabled(settings.tickets),
            memberCounterEnabled: isSectionEnabled(settings.member_counter),
            remindersCount: parseCount(counts.reminders),
            rssCount: parseCount(counts.rss_feeds),
            tempVoiceCount: parseCount(counts.temp_voice),
            mediaOnlyCount: parseCount(counts.media_only),
            inviteTrackingEnabled: isSectionEnabled(settings.invite_tracker),
            welcomeEnabled: isSectionEnabled(settings.welcome),
            verificationEnabled: isSectionEnabled(settings.verification),
            leaveEnabled: isSectionEnabled(settings.leave),
        });
    } catch (error) {
        console.error("Failed to fetch guild feature matrix:", error);
        return [];
    }
}