/// Inserts a formal warning into the database and returns the generated warning ID.
pub async fn insert_warning(
    db: &sqlx::PgPool,
    guild_id: i64,
    user_id: i64,
    moderator_id: i64,
    reason: &str,
) -> Result<Option<i32>, sqlx::Error> {
    let row = sqlx::query!(
        r#"
        INSERT INTO warns (guild_id, user_id, moderator_id, reason)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        "#,
        guild_id,
        user_id,
        moderator_id,
        reason,
    )
        .fetch_optional(db)
        .await?;

    Ok(row.map(|r| r.id))
}

/// Logs an automod action execution event to the database.
pub async fn insert_automod_log(
    db: &sqlx::PgPool,
    guild_id: i64,
    user_id: i64,
    channel_id: i64,
    message_id: i64,
    rule_name: &str,
    trigger_content: Option<&str>,
    original_content: &str,
    actions_taken: &[&'static str], // Keep this slice of static string slices
) -> Result<(), sqlx::Error> {
    let actions_vec: Vec<String> = actions_taken
        .iter()
        .map(|&action| action.to_string())
        .collect();

    sqlx::query!(
        r#"
        INSERT INTO automod_logs (guild_id, user_id, channel_id, message_id, rule_type, trigger_content, original_content, actions_taken)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        "#,
        guild_id,
        user_id,
        channel_id,
        Some(message_id),
        rule_name,
        trigger_content,
        Some(original_content),
        &actions_vec, // Bind the Vec<String>
    )
        .execute(db)
        .await?;

    Ok(())
}