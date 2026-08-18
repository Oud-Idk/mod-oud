#![allow(missing_docs, clippy::unused_async)]
use crate::core::config::settings::get_settings;
use crate::core::config::state::{Context, Error};
use crate::features::reporting::actions;
use poise::Modal;
use tracing::{debug, info, trace, warn};

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
            "report_message command triggered with a non-application context"
        );
        return Ok(());
    };

    info!(
        reporter_id = %reporter.id,
        reported_message_id = %reported_message.id, %guild_id, "Invoked report_message context menu command"
    );

    let db = &ctx.data().core.db;
    let redis = ctx.data().core.redis.clone();
    let guild_configs = &ctx.data().core.guild_configs_cache;

    trace!(
        %guild_id,
        "Fetching server settings for report configuration check"
    );
    let config = get_settings(db, &redis, guild_configs, guild_id).await?;
    let report_enabled = config.report.is_some_and(|r| r.enabled);

    if !report_enabled {
        debug!(
            %guild_id,
            "Report command execution cancelled: report feature is disabled in this guild"
        );
        ctx.send(
            poise::CreateReply::default()
                .content("Reporting isn't enabled in this guild.")
                .ephemeral(true),
        )
        .await?;
        return Ok(());
    }

    trace!(reporter_id = %reporter.id, "Executing report modal prompt");
    let modal_data = ReportModal::execute(app_ctx).await?;

    if let Some(modal) = modal_data {
        debug!(
            reporter_id = %reporter.id,
            reported_message_id = %reported_message.id, "Report modal submitted; issuing report"
        );
        let result = actions::issue_report(
            db,
            &ctx.data().core.redis,
            &ctx.data().core.username_tx,
            guild_id,
            &reported_message,
            reporter,
            modal.reason,
        )
        .await?;

        let reply_content = if let Some(report_id) = result {
            info!(
                reporter_id = %reporter.id,
                reported_message_id = %reported_message.id, report_id, "Message report successfully created and recorded"
            );
            "Your report has been submitted to the moderation team."
        } else {
            debug!(
                reporter_id = %ctx.author().id,
                reported_message_id = %reported_message.id,
                "Duplicate report rejected: this message was already reported by this user"
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
        trace!(reporter_id = %reporter.id, "Report modal was cancelled or timed out");
    }

    Ok(())
}
