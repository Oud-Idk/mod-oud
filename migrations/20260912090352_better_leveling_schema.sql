BEGIN;

-- If scope is SPECIFIED_CHANNEL but channelId is null or empty,
-- downgrade scope to NONE so Rust/Zod doesn't choke on a missing payload.
UPDATE guild_configs
SET settings = jsonb_set(
        settings,
        '{leveling,notify,scope}',
        '"NONE"'::jsonb,
        false
               )
WHERE settings #>> '{leveling,notify,scope}' = 'SPECIFIED_CHANNEL'
  AND (
    settings #> '{leveling,notify,channelId}' IS NULL
        OR settings #>> '{leveling,notify,channelId}' IS NULL
        OR settings #>> '{leveling,notify,channelId}' = ''
    );

-- Strip `channelId` completely from any notification settings
-- where scope is NOT SPECIFIED_CHANNEL (NONE, DM, CURRENT_CHANNEL).
UPDATE guild_configs
SET settings = settings #- '{leveling,notify,channelId}'
WHERE settings #> '{leveling,notify}' IS NOT NULL
  AND settings #>> '{leveling,notify,scope}' != 'SPECIFIED_CHANNEL'
  AND settings ? 'leveling'
  AND (settings -> 'leveling') ? 'notify'
  AND (settings -> 'leveling' -> 'notify') ? 'channelId';

COMMIT;