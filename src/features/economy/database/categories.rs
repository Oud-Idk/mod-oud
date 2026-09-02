use crate::features::economy::types::ItemCategory;
use serenity::all::GuildId;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(sqlx::FromRow)]
struct RawItemCategory {
    id: Uuid,
    guild_id: i64,
    name: String,
}

impl From<RawItemCategory> for ItemCategory {
    fn from(r: RawItemCategory) -> Self {
        Self {
            id: r.id,
            guild_id: GuildId::new(r.guild_id.cast_unsigned()),
            name: r.name,
        }
    }
}

pub async fn list_categories(
    db: &PgPool,
    guild_id: GuildId,
) -> Result<Vec<ItemCategory>, sqlx::Error> {
    let rows = sqlx::query_as!(
        RawItemCategory,
        r#"
        SELECT id, guild_id, name
        FROM economy_categories
        WHERE guild_id = $1
        ORDER BY name ASC
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
        SELECT id, guild_id, name
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
) -> Result<ItemCategory, sqlx::Error> {
    let row = sqlx::query_as!(
        RawItemCategory,
        r#"
        INSERT INTO economy_categories (guild_id, name)
        VALUES ($1, $2)
        RETURNING id, guild_id, name
        "#,
        guild_id.get().cast_signed(),
        name,
    )
    .fetch_one(db)
    .await?;

    Ok(row.into())
}
