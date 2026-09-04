-- Splits membership verification out of the `welcome` config object into its own
-- top-level `verification` key so the two features are configured independently.
--
-- Idempotent: backfills only rows missing the top-level key, then drops the
-- legacy nested copy wherever the top-level key exists (including rows that
-- already had both from the transitional dual-write period).

UPDATE guild_configs
SET settings = jsonb_set(
    COALESCE(settings, '{}'::jsonb),
    '{verification}',
    settings #> '{welcome,verification}',
    true
)
WHERE settings #> '{welcome,verification}' IS NOT NULL
  AND settings #> '{verification}' IS NULL;

UPDATE guild_configs
SET settings = settings #- '{welcome,verification}'
WHERE settings #> '{welcome,verification}' IS NOT NULL
  AND settings #> '{verification}' IS NOT NULL;
