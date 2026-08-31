use crate::features::economy::types::ItemCategory;
use serenity::all::GuildId;
use sqlx::PgPool;
use uuid::Uuid;

pub async fn list_categories(db: &PgPool, guild_id: GuildId) -> Result<Vec<ItemCategory>, sqlx::Error> {
    sqlx::query_as!(
        ItemCategory,
        r#"
        SELECT id, guild_id, name, description, position, emoji_unicode, emoji_id
        FROM economy_categories
        WHERE guild_id = $1
        ORDER BY position ASC, name ASC
        "#,
        guild_id.get().cast_signed(),
    )
    .fetch_all(db)
    .await
}

pub async fn get_category(
    db: &PgPool,
    guild_id: GuildId,
    category_id: Uuid,
) -> Result<Option<ItemCategory>, sqlx::Error> {
    sqlx::query_as!(
        ItemCategory,
        r#"
        SELECT id, guild_id, name, description, position, emoji_unicode, emoji_id
        FROM economy_categories
        WHERE guild_id = $1 AND id = $2
        "#,
        guild_id.get().cast_signed(),
        category_id,
    )
    .fetch_optional(db)
    .await
}

pub async fn create_category(
    db: &PgPool,
    guild_id: GuildId,
    name: &str,
    description: &str,
) -> Result<ItemCategory, sqlx::Error> {
    sqlx::query_as!(
        ItemCategory,
        r#"
        INSERT INTO economy_categories (guild_id, name, description)
        VALUES ($1, $2, $3)
        RETURNING id, guild_id, name, description, position, emoji_unicode, emoji_id
        "#,
        guild_id.get().cast_signed(),
        name,
        description,
    )
    .fetch_one(db)
    .await
}
