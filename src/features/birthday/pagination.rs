use crate::core::config::state::{Context, Error};
use crate::features::birthday::format::format_ordinal;
use crate::features::birthday::types::FullUserBirthdayRecord;
use crate::shared::pagination::paginate;
use chrono::{Datelike, Utc};

const MONTH_NAMES: [&str; 12] = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

fn format_birthday_line(b: &FullUserBirthdayRecord) -> String {
    let month_name = MONTH_NAMES
        .get((b.birth_month - 1) as usize)
        .unwrap_or(&"Unknown");
    let current_year = Utc::now().year();

    let age_str = if let Some(year) = b.birth_year {
        let age = current_year - (year as i32);
        format!(" ({})", format_ordinal(age))
    } else {
        String::new()
    };

    format!("• <@{}> — **{} {}**{}\n", b.user_id, month_name, b.birth_day, age_str)
}

/// Paginate a list of birthday records
pub async fn paginate_birthdays(
    ctx: Context<'_>,
    records: &[FullUserBirthdayRecord],
    title: String,
) -> Result<(), Error> {
    let items_per_page = 10;
    let chunks: Vec<_> = records.chunks(items_per_page).collect();
    let total_pages = chunks.len();

    paginate(ctx, total_pages, move |page_idx| {
        let mut description = String::new();

        for record in chunks[page_idx] {
            description.push_str(&format_birthday_line(record));
        }

        poise::serenity_prelude::CreateEmbed::new()
            .title(&title)
            .description(description)
            .color(0x5865F2)
            .footer(poise::serenity_prelude::CreateEmbedFooter::new(format!(
                "Page {} of {}",
                page_idx + 1,
                total_pages
            )))
    })
        .await?;

    Ok(())
}