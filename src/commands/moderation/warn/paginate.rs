use crate::commands::helpers::pagination;
use crate::types::{Context, Error, WarningInfo};
use tracing::trace;

fn make_page(warn: &WarningInfo) -> String {
    let status = if warn.is_active.unwrap_or(true) { "Active" } else { "Pardoned" };
    let time_str = match warn.created_at {
        Some(ts) => format!("<t:{0}:f> (<t:{0}:R>)", ts),
        None => "*Unknown date*".to_string(),
    };
    let reason = warn.reason.as_deref().unwrap_or("*No reason provided*");

    format!(
        "**ID: `{}`** | **Mod:** <@{}> ({})\n**User:** <@{}>\n**Date:** {}\n**Reason:** {}\n\n",
        warn.id, warn.moderator_id, status, warn.user_id, time_str, reason
    )
}

/// Formats and paginates a list of warnings using standard pagination controls.
pub async fn paginate_warnings(
    ctx: Context<'_>,
    warnings: &[WarningInfo],
    title: String,
    thumbnail_url: Option<String>,
) -> Result<(), Error> {
    let warnings_per_page = 5;
    let chunks: Vec<_> = warnings.chunks(warnings_per_page).collect();
    let total_pages = chunks.len();

    trace!(
        total_warnings = warnings.len(),
        total_pages,
        "Rendering warning pagination flow"
    );

    pagination::paginate(ctx, total_pages, move |page_idx| {
        let mut embed_description = String::new();

        for warn in chunks[page_idx] {
            embed_description.push_str(&make_page(warn));
        }

        let mut embed = poise::serenity_prelude::CreateEmbed::new()
            .title(&title)
            .description(embed_description)
            .color(0x5865F2)
            .footer(poise::serenity_prelude::CreateEmbedFooter::new(format!(
                "Page {} of {}", page_idx + 1, total_pages
            )));

        if let Some(ref url) = thumbnail_url {
            embed = embed.thumbnail(url.clone());
        }

        embed
    }).await?;

    Ok(())
}