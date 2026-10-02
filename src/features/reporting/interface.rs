//! The Discord-side surface of a report: the alert's buttons, the modals those buttons open,
//! and the handling of both.
//!
//! Every custom id is built here and parsed here, so the writer and the reader of the wire
//! format cannot drift.

use crate::core::config::state::{BotData, Error};
use crate::features::moderation::check_hierarchy_in;
use crate::features::reporting::cache;
use crate::features::reporting::database::get_reported_message_by_id;
use crate::features::reporting::moderation::{
    ActionError, ActionRequest, ReportDeps, ban_user, delete_message, duration_secs, settle,
    timeout_user, warn_user,
};
use crate::features::reporting::types::{ReportAction, ReportStatus, ReportedMessagePayload};
use crate::shared::permissions::has_permissions;
use serenity::all::{
    ActionRowComponent, ButtonStyle, ChannelId, ComponentInteraction, Context, CreateActionRow,
    CreateButton, CreateEmbed, CreateInputText, CreateInteractionResponse,
    CreateInteractionResponseMessage, CreateModal, EditInteractionResponse, EditMessage, GuildId,
    Http, InputTextStyle, Interaction, Member, MessageId, ModalInteraction, Permissions, User,
    UserId,
};
use std::sync::OnceLock;
use tracing::{debug, info, instrument, warn};

/// A `serenity::Error` is over a hundred bytes, so returning one by value from every helper
/// here would put a large `Err` on each caller's stack.
type BoxedError = Box<serenity::Error>;

const BUTTON_PREFIX: &str = "report:";
const MODAL_PREFIX: &str = "report_modal:";
const REASON_INPUT: &str = "reason";
const DURATION_INPUT: &str = "duration_mins";

/// Discord allows 5 buttons per row, so the six actions take two.
const BUTTONS_PER_ROW: usize = 5;

/// Either kind of interaction a report alert can produce, so one flow handles both.
enum Alert {
    Button(Box<ComponentInteraction>),
    Modal(Box<ModalInteraction>),
}

impl Alert {
    fn guild_id(&self) -> Option<GuildId> {
        match self {
            Self::Button(i) => i.guild_id,
            Self::Modal(i) => i.guild_id,
        }
    }

    fn channel_id(&self) -> ChannelId {
        match self {
            Self::Button(i) => i.channel_id,
            Self::Modal(i) => i.channel_id,
        }
    }

    fn user(&self) -> &User {
        match self {
            Self::Button(i) => &i.user,
            Self::Modal(i) => &i.user,
        }
    }

    fn member(&self) -> Option<&Member> {
        match self {
            Self::Button(i) => i.member.as_ref(),
            Self::Modal(i) => i.member.as_ref(),
        }
    }

    fn custom_id(&self) -> &str {
        match self {
            Self::Button(i) => i.data.custom_id.as_str(),
            Self::Modal(i) => i.data.custom_id.as_str(),
        }
    }

    /// The alert the interaction came from. A modal opened by a button carries it; one opened
    /// by an application command would not, which is why this is an `Option`.
    fn alert_message_id(&self) -> Option<MessageId> {
        match self {
            Self::Button(i) => Some(i.message.id),
            Self::Modal(i) => i.message.as_ref().map(|m| m.id),
        }
    }

    /// Boxed, and `Result<(), _>` rather than the `Result<Message, _>` serenity returns:
    /// nothing here reads the message back.
    async fn create_response(
        &self,
        http: &Http,
        response: CreateInteractionResponse,
    ) -> Result<(), BoxedError> {
        match self {
            Self::Button(i) => i.create_response(http, response).await.map_err(Box::new),
            Self::Modal(i) => i.create_response(http, response).await.map_err(Box::new),
        }
        .map(drop)
    }

    async fn edit_response(
        &self,
        http: &Http,
        response: EditInteractionResponse,
    ) -> Result<(), BoxedError> {
        match self {
            Self::Button(i) => i.edit_response(http, response).await.map_err(Box::new),
            Self::Modal(i) => i.edit_response(http, response).await.map_err(Box::new),
        }
        .map(drop)
    }

    async fn edit_alert(&self, http: &Http, edit: EditMessage) -> Result<(), BoxedError> {
        let Some(message_id) = self.alert_message_id() else {
            return Ok(());
        };

        http.edit_message(self.channel_id(), message_id, &edit, Vec::new())
            .await
            .map(|_| ())
            .map_err(Box::new)
    }
}

/// Entry point for the buttons and modals on a report alert.
///
/// # Errors
/// Propagates Discord failures from answering an interaction.
pub async fn handle_interaction(
    ctx: &Context,
    interaction: &Interaction,
    data: &BotData,
) -> Result<(), Error> {
    match interaction {
        Interaction::Component(component) => {
            if component.data.custom_id.starts_with(BUTTON_PREFIX) {
                Box::pin(on_button(
                    ctx,
                    Alert::Button(Box::new(component.clone())),
                    data,
                ))
                .await
            } else {
                Ok(())
            }
        }
        Interaction::Modal(modal) => {
            if modal.data.custom_id.starts_with(MODAL_PREFIX) {
                Box::pin(on_modal_submit(
                    ctx,
                    Alert::Modal(Box::new(modal.clone())),
                    data,
                ))
                .await
            } else {
                Ok(())
            }
        }
        _ => Ok(()),
    }
}

/// The button rows for a report alert.
#[must_use]
pub fn action_rows(report_id: i64) -> Vec<CreateActionRow> {
    ReportAction::ALL
        .chunks(BUTTONS_PER_ROW)
        .map(|chunk| {
            CreateActionRow::Buttons(chunk.iter().map(|a| button(*a, report_id)).collect())
        })
        .collect()
}

fn button(action: ReportAction, report_id: i64) -> CreateButton {
    let (style, emoji) = match action {
        ReportAction::DeleteMessage => (ButtonStyle::Danger, '🗑'),
        ReportAction::Warn => (ButtonStyle::Secondary, '⚠'),
        ReportAction::Timeout => (ButtonStyle::Secondary, '🔇'),
        ReportAction::Ban => (ButtonStyle::Danger, '🔨'),
        ReportAction::Dismiss => (ButtonStyle::Secondary, '🙅'),
        ReportAction::Actioned => (ButtonStyle::Success, '✅'),
    };

    CreateButton::new(button_custom_id(action, report_id))
        .style(style)
        .emoji(emoji)
        .label(action.label())
}

fn button_custom_id(action: ReportAction, report_id: i64) -> String {
    format!("{BUTTON_PREFIX}{}:{report_id}", action.slug())
}

/// A report id is a positive `bigserial`. Anything else is a crafted id, and the query for it
/// would just be a miss, but there is no reason to issue one.
fn parse_report_id(raw: &str) -> Option<i64> {
    match raw.parse::<i64>() {
        Ok(id) if id > 0 => Some(id),
        _ => None,
    }
}

/// Splits a button custom id back into the action and the report it targets.
fn parse_button(custom_id: &str) -> Option<(ReportAction, i64)> {
    let (slug, report_id) = custom_id.strip_prefix(BUTTON_PREFIX)?.rsplit_once(':')?;
    Some((ReportAction::from_slug(slug)?, parse_report_id(report_id)?))
}

fn modal_custom_id(action: ReportAction, report_id: i64) -> String {
    format!("{MODAL_PREFIX}{}:{report_id}", action.slug())
}

/// Splits a modal custom id back into the action and the report it targets.
fn parse_modal(custom_id: &str) -> Option<(ReportAction, i64)> {
    let (slug, report_id) = custom_id.strip_prefix(MODAL_PREFIX)?.rsplit_once(':')?;
    Some((ReportAction::from_slug(slug)?, parse_report_id(report_id)?))
}

/// Answers a click on one of the alert's buttons.
#[instrument(skip_all, fields(report_id, guild_id = ?alert.guild_id(), moderator_id = %alert.user().id))]
async fn on_button(ctx: &Context, alert: Alert, data: &BotData) -> Result<(), Error> {
    let Some((action, report_id)) = parse_button(alert.custom_id()) else {
        debug!(custom_id = alert.custom_id(), "unrecognized report button");
        return Ok(());
    };

    let Some(member) = alert.member().cloned() else {
        warn!(
            report_id,
            moderator_id = %alert.user().id,
            reason = "no_member",
            "report button pressed without a guild member"
        );
        return refuse(ctx, &alert, "This button only works inside a server.").await;
    };

    let report = match authorize(ctx, data, &alert, &member, action, report_id).await {
        Ok(report) => report,
        Err(reason) => return refuse(ctx, &alert, &reason).await,
    };

    if action.needs_input() {
        return open_modal(ctx, &alert, action, report_id, &report).await;
    }

    alert
        .create_response(
            &ctx.http,
            CreateInteractionResponse::Defer(CreateInteractionResponseMessage::new()),
        )
        .await?;

    finish(ctx, data, &alert, &member, action, &report, None, None).await
}

/// Answers a modal one of the alert's buttons opened.
#[instrument(skip_all, fields(report_id, guild_id = ?alert.guild_id(), moderator_id = %alert.user().id))]
async fn on_modal_submit(ctx: &Context, alert: Alert, data: &BotData) -> Result<(), Error> {
    let Alert::Modal(modal) = &alert else {
        debug!(
            custom_id = alert.custom_id(),
            "report modal id on a button interaction"
        );
        return Ok(());
    };

    let Some((action, report_id)) = parse_modal(alert.custom_id()) else {
        debug!(custom_id = alert.custom_id(), "unrecognized report modal");
        return Ok(());
    };

    let Some(member) = alert.member().cloned() else {
        warn!(
            report_id,
            moderator_id = %alert.user().id,
            reason = "no_member",
            "report modal submitted without a guild member"
        );
        return refuse(ctx, &alert, "This form only works inside a server.").await;
    };

    let reason = input_value(Some(modal), REASON_INPUT);

    let duration_mins = match input_value(Some(modal), DURATION_INPUT) {
        Some(raw) => match parse_duration_mins(&raw) {
            Ok(mins) => Some(mins),
            Err(reason) => return refuse(ctx, &alert, &reason).await,
        },
        None => None,
    };

    // The moderator may have lost the permission, or the report been settled, while the form
    // was open, so the checks run again rather than being trusted from the click.
    let report = match authorize(ctx, data, &alert, &member, action, report_id).await {
        Ok(report) => report,
        Err(reason) => return refuse(ctx, &alert, &reason).await,
    };

    alert
        .create_response(
            &ctx.http,
            CreateInteractionResponse::Defer(CreateInteractionResponseMessage::new()),
        )
        .await?;

    finish(
        ctx,
        data,
        &alert,
        &member,
        action,
        &report,
        reason,
        duration_mins,
    )
    .await
}

/// Runs the checks that stand between a click and a ban, then loads the report.
///
/// Returns the sentence to show the moderator when one of them fails.
async fn authorize(
    ctx: &Context,
    data: &BotData,
    alert: &Alert,
    member: &Member,
    action: ReportAction,
    report_id: i64,
) -> Result<ReportedMessagePayload, String> {
    let Some(guild_id) = alert.guild_id() else {
        return Err("This button only works inside a server.".to_string());
    };

    let report = get_reported_message_by_id(&data.core.db, report_id)
        .await
        .inspect_err(|e| warn!(error = ?e, report_id, "report lookup for a report action failed"))
        .map_err(|_| "Something went wrong on our end.".to_string())?
        .ok_or_else(|| "That report no longer exists.".to_string())?;

    // The id arrives from a custom id, so it has to belong to the guild the press came from.
    // Without this, a press in one guild could action a report belonging to another.
    if report.guild_id != guild_id {
        warn!(
            report_id,
            %guild_id,
            report_guild_id = %report.guild_id,
            moderator_id = %member.user.id,
            "report action refused; the report belongs to another guild"
        );
        return Err("That report does not belong to this server.".to_string());
    }

    if report.status != ReportStatus::UnderReview {
        debug!(
            report_id,
            status = ?report.status,
            "report action refused; it is no longer under review"
        );
        return Err(format!(
            "This report has already been {}.",
            report.status.label().to_lowercase()
        ));
    }

    let required = action.required_permission();
    if !member_may_act(ctx, guild_id, member, required).await {
        warn!(
            report_id,
            %guild_id,
            moderator_id = %member.user.id,
            action = action.slug(),
            required = %required,
            "report action refused; the moderator lacks the permission"
        );
        return Err(format!(
            "You need the {} permission to do that.",
            permission_label(required)
        ));
    }

    // A hierarchy refusal is the moderator's answer, so the bot's own id is fetched here
    // rather than per action.
    let bot = bot_id(ctx)
        .await
        .inspect_err(|e| warn!(error = %e, report_id, "bot user lookup for a report action failed"))
        .map_err(|_| "Something went wrong on our end.".to_string())?;
    let hierarchy = check_hierarchy_in(ctx, guild_id, bot, member.user.id, report.author_id).await;

    if let Err(e) = hierarchy {
        debug!(
            report_id,
            %guild_id,
            moderator_id = %member.user.id,
            error = %e,
            "report action refused by role hierarchy"
        );
        return Err(e.to_string());
    }

    debug!(
        report_id,
        %guild_id,
        moderator_id = %member.user.id,
        action = action.slug(),
        "report action authorized"
    );

    Ok(report)
}

/// Applies the action, then reports the outcome to the moderator and the channel.
#[allow(clippy::too_many_arguments)]
async fn finish(
    ctx: &Context,
    data: &BotData,
    alert: &Alert,
    member: &Member,
    action: ReportAction,
    report: &ReportedMessagePayload,
    reason: Option<String>,
    duration_mins: Option<u64>,
) -> Result<(), Error> {
    // `issue_warning` and the DMs record the moderator's name, which the interaction payload
    // carries but the report row does not.
    let moderator_name = member.user.name.clone();
    let moderator_id = member.user.id;

    let request = ActionRequest {
        report_id: report.id,
        guild_id: report.guild_id,
        target_id: report.author_id,
        moderator_id: Some(moderator_id),
        moderator_name: &moderator_name,
        target_name: &report.author_name,
        reason: reason.as_deref(),
        duration_mins,
    };

    let deps = ReportDeps {
        core: &data.core,
        http: &ctx.http,
    };

    let outcome = apply(&deps, action, report, &request).await;

    match outcome {
        Ok(()) => {
            broadcast(&deps, report.id).await;
            confirm(ctx, alert, report.id, action, duration_mins, moderator_id).await;
            Ok(())
        }
        Err(err) => {
            warn!(
                report_id = report.id,
                %report.guild_id,
                %moderator_id,
                action = action.slug(),
                error = %err,
                "report action from the reporting channel not applied"
            );

            let _ = alert
                .edit_response(
                    &ctx.http,
                    EditInteractionResponse::new().content(format!(
                        "Report #{}: could not {}: {err}",
                        report.id,
                        action.past_tense(),
                    )),
                )
                .await;

            Ok(())
        }
    }
}

/// Dispatches to the action that has an effect on Discord.
async fn apply(
    deps: &ReportDeps<'_>,
    action: ReportAction,
    report: &ReportedMessagePayload,
    request: &ActionRequest<'_>,
) -> Result<(), ActionError> {
    match action {
        ReportAction::DeleteMessage => {
            delete_message(
                deps,
                request,
                report.channel_id,
                report.message_id,
                "Reported as abusive",
            )
            .await
        }
        ReportAction::Warn => warn_user(deps, request).await,
        ReportAction::Timeout => timeout_user(deps, request).await,
        ReportAction::Ban => ban_user(deps, request).await,
        other => {
            let status = other.resulting_status().ok_or(ActionError::Internal)?;
            settle(deps, request, status).await
        }
    }
}

/// Pushes the updated report to the dashboard's live stream, matching what the route does.
async fn broadcast(deps: &ReportDeps<'_>, report_id: i64) {
    let updated = match get_reported_message_by_id(&deps.core.db, report_id).await {
        Ok(Some(updated)) => updated,
        Ok(None) => return,
        Err(e) => {
            warn!(error = ?e, report_id, "report reload after a channel action failed");
            return;
        }
    };

    let payload = match serde_json::to_string(&updated) {
        Ok(payload) => payload,
        Err(e) => {
            warn!(error = ?e, report_id, "report update serialization failed");
            return;
        }
    };

    if let Err(e) = cache::publish_report(&deps.core.redis, &payload).await {
        warn!(error = ?e, report_id, "report update broadcast failed");
    }
}

/// Tells the moderator it worked, then strips the alert's buttons and records what happened.
async fn confirm(
    ctx: &Context,
    alert: &Alert,
    report_id: i64,
    action: ReportAction,
    duration_mins: Option<u64>,
    moderator_id: UserId,
) {
    let summary = outcome_summary(action, duration_mins);

    if let Err(e) = alert
        .edit_response(
            &ctx.http,
            EditInteractionResponse::new().content(format!("Report #{report_id}: {summary}.")),
        )
        .await
    {
        warn!(error = %e, report_id, "report action confirmation not edited");
    }

    let attribution = format!("Done by <@{}> (report #{report_id})", moderator_id.get());
    let edit = EditMessage::new()
        .components(Vec::new())
        .add_embed(CreateEmbed::new().description(summary))
        .add_embed(CreateEmbed::new().description(attribution));

    match alert.edit_alert(&ctx.http, edit).await {
        Ok(()) => info!(
            report_id,
            channel_id = %alert.channel_id(),
            %moderator_id,
            action = action.slug(),
            "report alert closed from the reporting channel"
        ),
        Err(e) => warn!(error = %e, report_id, "report alert not closed"),
    }
}

/// Opens the form for an action that needs a reason or a duration.
async fn open_modal(
    ctx: &Context,
    alert: &Alert,
    action: ReportAction,
    report_id: i64,
    report: &ReportedMessagePayload,
) -> Result<(), Error> {
    let mut rows = vec![CreateActionRow::InputText(
        CreateInputText::new(
            InputTextStyle::Paragraph,
            reason_label(action),
            REASON_INPUT,
        )
        .placeholder(reason_placeholder(action))
        .max_length(1000)
        .required(action != ReportAction::Dismiss),
    )];

    if action == ReportAction::Timeout {
        rows.push(CreateActionRow::InputText(
            CreateInputText::new(InputTextStyle::Short, "Duration in minutes", DURATION_INPUT)
                .placeholder("e.g. 60 for an hour")
                .max_length(6)
                .required(true),
        ));
    }

    let title = format!("{} {}", action.label(), report.id);
    let modal = CreateModal::new(modal_custom_id(action, report_id), title).components(rows);

    alert
        .create_response(&ctx.http, CreateInteractionResponse::Modal(modal))
        .await?;

    debug!(
        report_id,
        action = action.slug(),
        "report action modal opened"
    );
    Ok(())
}

/// Refuses an interaction with an ephemeral sentence.
async fn refuse(ctx: &Context, alert: &Alert, reason: &str) -> Result<(), Error> {
    debug!(
        custom_id = alert.custom_id(),
        user_id = %alert.user().id,
        "report interaction refused"
    );

    alert
        .create_response(
            &ctx.http,
            CreateInteractionResponse::Message(
                CreateInteractionResponseMessage::new()
                    .content(reason)
                    .ephemeral(true),
            ),
        )
        .await?;

    Ok(())
}

fn outcome_summary(action: ReportAction, duration_mins: Option<u64>) -> String {
    match (action, duration_mins) {
        (ReportAction::Timeout, Some(mins)) => format!("Timed out the reported user for {mins}m"),
        _ => action.past_tense().to_string(),
    }
}

const fn reason_label(action: ReportAction) -> &'static str {
    match action {
        ReportAction::Timeout => "Why are they being timed out?",
        ReportAction::Dismiss => "Why is this report being dismissed?",
        _ => "Reason",
    }
}

const fn reason_placeholder(action: ReportAction) -> &'static str {
    match action {
        ReportAction::Timeout => "Spamming the general channel...",
        ReportAction::Dismiss => "Optional: what did the reporter get wrong?",
        _ => "This is shown to the user and written to the moderation log.",
    }
}

/// Serenity has no name lookup on `Permissions`, so the three this feature gates on are named
/// here. A fourth would fall through to `Manage Messages`, which is a safe default to be wrong
/// towards in the sentence a moderator reads.
const fn permission_label(permissions: Permissions) -> &'static str {
    if permissions.contains(Permissions::BAN_MEMBERS) {
        "Ban Members"
    } else if permissions.contains(Permissions::MODERATE_MEMBERS) {
        "Moderate Members"
    } else {
        "Manage Messages"
    }
}

/// Checks a member holds `required`, treating the guild owner as holding all of it.
///
/// # Errors
/// Returns the sentence to show the moderator when the owner cannot be read, since a guild
/// whose owner lookup fails cannot be authorized either way.
async fn member_may_act(
    ctx: &Context,
    guild_id: GuildId,
    member: &Member,
    required: Permissions,
) -> bool {
    // The cache carries the role map, so this is only an HTTP call on a cold guild.
    let (owner_id, roles) = if let Some(guild) = ctx.cache.guild(guild_id) {
        (guild.owner_id, guild.roles.clone())
    } else {
        match guild_id.to_partial_guild(ctx).await {
            Ok(guild) => (guild.owner_id, guild.roles),
            Err(e) => {
                warn!(error = %e, %guild_id, "guild lookup for a report action failed");
                return false;
            }
        }
    };

    has_permissions(member, guild_id, owner_id, &roles, required)
}

/// The bot's own user id, which a serenity `Context` does not carry. `GET /users/@me` would
/// otherwise sit on the interaction's three second budget next to the report lookup and the
/// hierarchy check, and the answer cannot change while the process runs.
static BOT_ID: OnceLock<UserId> = OnceLock::new();

async fn bot_id(ctx: &Context) -> Result<UserId, Error> {
    if let Some(id) = BOT_ID.get() {
        return Ok(*id);
    }

    let user = ctx.http.get_current_user().await?;
    Ok(*BOT_ID.get_or_init(|| user.id))
}

/// Reads a text input out of a submitted modal.
fn input_value(modal: Option<&ModalInteraction>, custom_id: &str) -> Option<String> {
    modal?
        .data
        .components
        .iter()
        .flat_map(|row| row.components.iter())
        .find_map(|c| match c {
            ActionRowComponent::InputText(input) if input.custom_id == custom_id => input
                .value
                .as_deref()
                .map(str::trim)
                .filter(|v| !v.is_empty())
                .map(String::from),
            _ => None,
        })
}

/// Parses the timeout duration a moderator typed.
///
/// # Errors
/// Returns the sentence to show when the input is not a usable minute count.
fn parse_duration_mins(raw: &str) -> Result<u64, String> {
    let mins: u64 = raw
        .parse()
        .map_err(|_| "Enter the timeout in whole minutes.".to_string())?;

    // Discord's longest timeout is 28 days.
    if mins == 0 || mins > 28 * 24 * 60 {
        return Err("Timeouts run from 1 minute to 28 days.".to_string());
    }

    // The modal caps the field at six characters, so this only trips on a crafted payload.
    duration_secs(mins).map(|_| mins).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::{
        ReportAction, ReportStatus, button_custom_id, modal_custom_id, parse_button,
        parse_duration_mins, parse_modal,
    };

    /// Every action must survive a round trip through its own custom id, or a moderator's
    /// click lands on the wrong report or the wrong action.
    #[test]
    fn every_action_round_trips_through_its_custom_id() {
        for action in ReportAction::ALL {
            for report_id in [1_i64, i64::MAX, 987_654_321] {
                assert_eq!(
                    parse_button(&button_custom_id(action, report_id)),
                    Some((action, report_id))
                );
                assert_eq!(
                    parse_modal(&modal_custom_id(action, report_id)),
                    Some((action, report_id))
                );
            }
        }
    }

    /// A button id handed to the modal parser, or the reverse, must not be accepted.
    #[test]
    fn the_two_custom_id_schemes_do_not_cross() {
        let button = button_custom_id(ReportAction::Ban, 42);
        let modal = modal_custom_id(ReportAction::Ban, 42);

        assert_eq!(parse_modal(&button), None);
        assert_eq!(parse_button(&modal), None);
    }

    /// Custom ids are attacker-supplied, so anything unrecognised is ignored rather than
    /// guessed at. A malformed id must never resolve to a report.
    #[test]
    fn malformed_custom_ids_are_ignored() {
        assert_eq!(parse_button("report:ban"), None);
        assert_eq!(parse_button("report:ban:not-a-number"), None);
        assert_eq!(parse_button("report:obliterate:42"), None);
        assert_eq!(parse_button("report::42"), None);
        assert_eq!(parse_button("report:ban:42:extra"), None);
        assert_eq!(parse_button("report:ban:-1"), None);
        assert_eq!(parse_button("something_else:ban:42"), None);
    }

    /// A negative id parses as `i64`, so the sign is checked before the row is ever looked up.
    #[test]
    fn a_non_positive_report_id_is_rejected_at_parse() {
        assert_eq!(parse_button("report:ban:-1"), None);
        assert_eq!(parse_button("report:ban:0"), None);
        assert_eq!(parse_modal("report_modal:ban:0"), None);
        assert_eq!(parse_button("report:ban:9223372036854775808"), None);
    }

    /// Dropping a permission from the table would hand out a button no moderator can use.
    #[test]
    fn every_action_requires_a_permission() {
        for action in ReportAction::ALL {
            assert!(
                !action.required_permission().is_empty(),
                "{} requires no permission",
                action.label()
            );
        }
    }

    #[test]
    fn durations_a_moderator_would_actually_send_are_accepted() {
        assert_eq!(parse_duration_mins("1").ok(), Some(1));
        assert_eq!(parse_duration_mins("60").ok(), Some(60));
        assert_eq!(parse_duration_mins("40320").ok(), Some(40_320));
    }

    /// Zero would expire the timeout the instant it applied, and the cap is Discord's.
    #[test]
    fn durations_outside_discords_range_are_rejected() {
        assert!(parse_duration_mins("0").is_err());
        assert!(parse_duration_mins("40321").is_err());
        assert!(parse_duration_mins("").is_err());
        assert!(parse_duration_mins("abc").is_err());
        assert!(parse_duration_mins("-5").is_err());
        assert!(parse_duration_mins("1.5").is_err());
    }

    /// Only the two status actions settle the report, and they settle it differently.
    #[test]
    fn only_the_status_actions_settle_the_report() {
        assert_eq!(
            ReportAction::Dismiss.resulting_status(),
            Some(ReportStatus::Dismissed)
        );
        assert_eq!(
            ReportAction::Actioned.resulting_status(),
            Some(ReportStatus::Actioned)
        );

        for action in [
            ReportAction::DeleteMessage,
            ReportAction::Warn,
            ReportAction::Timeout,
            ReportAction::Ban,
        ] {
            assert_eq!(action.resulting_status(), None, "{}", action.label());
        }
    }
}
