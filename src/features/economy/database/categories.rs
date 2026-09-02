use crate::features::economy::types::ItemCategory;
use serenity::all::GuildId;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(sqlx::FromRow)]
struct RawItemCategory {
    id: Uuid,
    guild_id: i64,
    name: String,
    description: String,
    position: i32,
    emoji_unicode: Option<String>,
    emoji_id: Option<String>,
}

impl From<RawItemCategory> for ItemCategory {
    fn from(r: RawItemCategory) -> Self {
        Self {
            id: r.id,
            guild_id: GuildId::new(r.guild_id.cast_unsigned()),
            name: r.name,
            description: r.description,
            position: r.position,
            emoji_unicode: r.emoji_unicode,
            emoji_id: r.emoji_id,
        }
    }
}

pub async fn list_categories(db: &PgPool, guild_id: GuildId) -> Result<Vec<ItemCategory>, sqlx::Error> {
    let rows = sqlx::query_as!(
        RawItemCategory,
        r#"
        SELECT id, guild_id, name, description, position, emoji_unicode, emoji_id
        FROM economy_categories
        WHERE guild_id = $1
        ORDER BY position ASC, name ASC
        "#,
        guild_id.get().cast_signed(),
    )
    .fetch_all(db)
    .await?;

    Ok(rows.into_iter().map(Into::into).collect())
}

pub async fn get_category(
    db: &PgPool,
    guild_id: GuildId,
    category_id: Uuid,
) -> Result<Option<ItemCategory>, sqlx::Error> {
    let row = sqlx::query_as!(
        RawItemCategory,
        r#"
        SELECT id, guild_id, name, description, position, emoji_unicode, emoji_id
        FROM economy_categories
        WHERE guild_id = $1 AND id = $2
        "#,
        guild_id.get().cast_signed(),
        category_id,
    )
    .fetch_optional(db)
    .await?;

    Ok(row.map(Into::into))
}

pub async fn create_category(
    db: &PgPool,
    guild_id: GuildId,
    name: &str,
    description: &str,
) -> Result<ItemCategory, sqlx::Error> {
    let row = sqlx::query_as!(
        RawItemCategory,
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
    .await?;

    Ok(row.into())
}
