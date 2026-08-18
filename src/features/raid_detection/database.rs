use serenity::all::GuildId;
use sqlx::PgPool;

pub async fn bump_verification_to_max(
    pool: &PgPool,
    guild_id: GuildId,
) -> Result<u64, sqlx::Error> {
    let rows_affected = sqlx::query!(
        r#"
        UPDATE guild_configs
        SET settings = jsonb_set(
            jsonb_set(
                settings,
                '{welcome,verification,useOauth}',
                to_jsonb($2::bool),
                false
            ),
            '{welcome,verification,captchaType}',
            to_jsonb($3::text),
            false
        )
        WHERE guild_id = $1
          AND settings #> '{welcome,verification}' IS NOT NULL;
        "#,
        guild_id.get().cast_signed(),
        true,
        "HCAPTCHA"
    )
        .execute(pool)
        .await?
        .rows_affected();

    Ok(rows_affected)
}

pub async fn restore_verification_settings(
    pool: &PgPool,
    guild_id: GuildId,
    use_oauth: Option<bool>,
    captcha_type: Option<&str>,
) -> Result<u64, sqlx::Error> {
    let rows_affected = sqlx::query!(
        r#"
        UPDATE guild_configs
        SET settings = jsonb_set(
            jsonb_set(
                settings,
                '{welcome,verification,useOauth}',
                COALESCE(to_jsonb($2::bool), 'null'::jsonb),
                true
            ),
            '{welcome,verification,captchaType}',
            COALESCE(to_jsonb($3::text), 'null'::jsonb),
            true
        )
        WHERE guild_id = $1
          AND settings #> '{welcome,verification}' IS NOT NULL;
        "#,
        guild_id.get().cast_signed(),
        use_oauth,
        captcha_type
    )
        .execute(pool)
        .await?
        .rows_affected();

    Ok(rows_affected)
}