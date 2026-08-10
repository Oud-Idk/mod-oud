import { db } from "@/lib/db";
import { mediaOnlyChannelSchema, type MediaOnlyChannel } from "./types";

const MEDIA_ONLY_COLUMNS = `
    channel_id                AS "channelId",
    guild_id                  AS "guildId",
    enabled,
    allow_images              AS "allowImages",
    allow_videos              AS "allowVideos",
    allow_audio               AS "allowAudio",
    allow_gif                 AS "allowGif",
    allow_links               AS "allowLinks",
    allow_embedded_text       AS "allowEmbeddedText",
    auto_thread               AS "autoThread",
    thread_name_template      AS "threadNameTemplate",
    delete_warning_after_secs AS "deleteWarningAfterSecs",
    exempt_roles              AS "exemptRoles"
`;

export async function getMediaOnlyChannels(guildId: string): Promise<MediaOnlyChannel[]> {
    const query = `
        SELECT ${MEDIA_ONLY_COLUMNS}
        FROM media_only_channels
        WHERE guild_id = $1
        ORDER BY channel_id;
    `;

    const res = await db.query(query, [guildId]);

    return res.rows.map((row) => mediaOnlyChannelSchema.parse(row));
}

/**
 * Batches the entire media-only config diff into a fixed number of queries:
 * 1 upsert for all saved channels + 1 delete for all removed channels.
 */
export async function saveMediaOnlyChannels(
    guildId: string,
    channels: MediaOnlyChannel[],
    removedChannelIds: string[]
): Promise<void> {
    if (channels.length > 0) {
        const upsertQuery = `
            INSERT INTO media_only_channels (
                channel_id, guild_id, enabled,
                allow_images, allow_videos, allow_audio, allow_gif, allow_links, allow_embedded_text,
                auto_thread, thread_name_template, delete_warning_after_secs, exempt_roles
            )
            SELECT
                u.channel_id::BIGINT,
                u.guild_id::BIGINT,
                u.enabled,
                u.allow_images,
                u.allow_videos,
                u.allow_audio,
                u.allow_gif,
                u.allow_links,
                u.allow_embedded_text,
                u.auto_thread,
                u.thread_name_template,
                u.delete_warning_after_secs::SMALLINT,
                u.exempt_roles::BIGINT[]
            FROM UNNEST(
                $1::TEXT[],
                $2::TEXT[],
                $3::BOOLEAN[],
                $4::BOOLEAN[],
                $5::BOOLEAN[],
                $6::BOOLEAN[],
                $7::BOOLEAN[],
                $8::BOOLEAN[],
                $9::BOOLEAN[],
                $10::BOOLEAN[],
                $11::TEXT[],
                $12::INT[],
                $13::TEXT[][]
            ) AS u(
                channel_id, guild_id, enabled,
                allow_images, allow_videos, allow_audio, allow_gif, allow_links, allow_embedded_text,
                auto_thread, thread_name_template, delete_warning_after_secs, exempt_roles
            )
            ON CONFLICT (channel_id) DO UPDATE SET
                enabled                   = EXCLUDED.enabled,
                allow_images              = EXCLUDED.allow_images,
                allow_videos              = EXCLUDED.allow_videos,
                allow_audio               = EXCLUDED.allow_audio,
                allow_gif                 = EXCLUDED.allow_gif,
                allow_links               = EXCLUDED.allow_links,
                allow_embedded_text       = EXCLUDED.allow_embedded_text,
                auto_thread               = EXCLUDED.auto_thread,
                thread_name_template      = EXCLUDED.thread_name_template,
                delete_warning_after_secs = EXCLUDED.delete_warning_after_secs,
                exempt_roles              = EXCLUDED.exempt_roles
        `;

        await db.query(upsertQuery, [
            channels.map((c) => c.channelId),
            channels.map(() => guildId),
            channels.map((c) => c.enabled),
            channels.map((c) => c.allowImages),
            channels.map((c) => c.allowVideos),
            channels.map((c) => c.allowAudio),
            channels.map((c) => c.allowGif),
            channels.map((c) => c.allowLinks),
            channels.map((c) => c.allowEmbeddedText),
            channels.map((c) => c.autoThread),
            channels.map((c) => c.threadNameTemplate),
            channels.map((c) => c.deleteWarningAfterSecs),
            channels.map((c) => c.exemptRoles),
        ]);
    }

    if (removedChannelIds.length > 0) {
        await db.query(
            `DELETE FROM media_only_channels WHERE guild_id = $1 AND channel_id = ANY($2::BIGINT[])`,
            [guildId, removedChannelIds]
        );
    }
}
