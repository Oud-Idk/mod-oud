#![allow(missing_docs, clippy::unused_async)]

use std::sync::Arc;
use crate::core::config::settings::get_settings;
use crate::core::config::state::{Context, Error};
use crate::features::reporting::actions;
use poise::Modal;
use tracing::{debug, info, warn};
use crate::features::reporting::actions::ReportMetadata;

#[derive(poise::Modal)]
#[name = "Report This Message"]
pub struct ReportModal {
    #[placeholder = "Please explain why you are reporting this message..."]
    #[paragraph]
    pub(crate) reason: String,
}

/// Report a message to the moderation team via the message context menu.
#[poise::command(context_menu_command = "Report This Message", guild_only)]
pub async fn report_message(
    ctx: Context<'_>,
    reported_message: serenity::all::Message,
) -> Result<(), Error> {
    let Some(guild_id) = ctx.guild_id() else {
        return Ok(());
    };

    let reporter = ctx.author();

    let Context::Application(app_ctx) = ctx else {
        warn!(
            reporter_id = %reporter.id,
            "report modal needs an application context"
        );
        return Ok(());
    };

    debug!(
        reporter_id = %reporter.id,
        reported_message_id = %reported_message.id, %guild_id, "report context menu invoked"
    );

    let db = &ctx.data().core.db;
    let redis = ctx.data().core.redis.clone();
    let guild_configs = &ctx.data().core.guild_configs_cache;

    let config = get_settings(db, &redis, guild_configs, guild_id).await?;
    let report_enabled = config.report.as_ref().is_some_and(|r| r.enabled);

    if !report_enabled {
        debug!(
            %guild_id,
            "report command cancelled; the feature is disabled for this guild"
        );
        ctx.send(
            poise::CreateReply::default()
                .content("Reporting isn't enabled in this guild.")
                .ephemeral(true),
        )
        .await?;
        return Ok(());
    }

    debug!(reporter_id = %reporter.id, "report modal shown");
    let modal_data = ReportModal::execute(app_ctx).await?;

    if let Some(modal) = modal_data {
        debug!(
            reporter_id = %reporter.id,
            reported_message_id = %reported_message.id, "report modal submitted"
        );
        let metadata = ReportMetadata {
            guild_id,
            reported_message: &reported_message,
            reporter,
            reason: modal.reason,
        };
        let result = actions::issue_report(
            db,
            &ctx.data().core.redis,
            &ctx.data().core.username_tx,
            metadata,
            &config,
            Arc::clone(&ctx.serenity_context().http),
            &ctx.data().core.config.domain,
        )
        .await?;

        let reply_content = if let Some(report_id) = result {
            info!(
                reporter_id = %reporter.id,
                reported_message_id = %reported_message.id, report_id, "message report created and recorded"
            );
            "Your report has been submitted to the moderation team."
        } else {
            debug!(
                reporter_id = %ctx.author().id,
                reported_message_id = %reported_message.id,
                "duplicate report rejected; this user already reported this message"
            );
            "Someone has already reported this message."
        };

        ctx.send(
            poise::CreateReply::default()
                .content(reply_content)
                .ephemeral(true),
        )
        .await?;
    } else {
        debug!(reporter_id = %reporter.id, "report modal was cancelled or timed out");
    }

    Ok(())
}
