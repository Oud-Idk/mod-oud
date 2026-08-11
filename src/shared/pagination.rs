use crate::core::config::state::{Context, Error};
use futures::Stream;
use futures_util::StreamExt;
use poise::ReplyHandle;
use serenity::all::ComponentInteraction;
use tracing::{debug, trace, warn};

/// Manages the state and UI layouts for paginated embeds.
pub struct PaginationState {
    current_page: usize,
    total_pages: usize,
    prev_id: String,
    next_id: String,
}

impl PaginationState {
    /// Creates a new pagination state.
    pub fn new(ctx_id: u64, total_pages: usize) -> Self {
        trace!(ctx_id, total_pages, "Initializing pagination state");
        Self {
            current_page: 0,
            total_pages,
            prev_id: format!("{}_prev", ctx_id),
            next_id: format!("{}_next", ctx_id),
        }
    }

    pub fn current_page(&self) -> usize {
        self.current_page
    }

    /// Generates button components based on the current page.
    pub fn create_components(&self) -> Vec<serenity::all::CreateActionRow> {
        trace!(current_page = self.current_page, "Generating active button components");
        let prev_btn = serenity::all::CreateButton::new(&self.prev_id)
            .label("◀")
            .style(serenity::all::ButtonStyle::Primary)
            .disabled(self.current_page == 0);

        let next_btn = serenity::all::CreateButton::new(&self.next_id)
            .label("▶")
            .style(serenity::all::ButtonStyle::Primary)
            .disabled(self.current_page == self.total_pages - 1);

        vec![serenity::all::CreateActionRow::Buttons(vec![prev_btn, next_btn])]
    }

    /// Generates disabled buttons for the final inactive message state.
    pub fn create_disabled_components(&self) -> Vec<serenity::all::CreateActionRow> {
        trace!("Generating disabled button components");
        let prev_btn = serenity::all::CreateButton::new(&self.prev_id)
            .label("◀")
            .style(serenity::all::ButtonStyle::Primary)
            .disabled(true);

        let next_btn = serenity::all::CreateButton::new(&self.next_id)
            .label("▶")
            .style(serenity::all::ButtonStyle::Primary)
            .disabled(true);

        vec![serenity::all::CreateActionRow::Buttons(vec![prev_btn, next_btn])]
    }

    /// Handles an incoming button interaction ID.
    /// Returns `true` if the page index changed, and `false` otherwise.
    pub fn handle_interaction(&mut self, custom_id: &str) -> bool {
        trace!(
            custom_id,
            current_page = self.current_page,
            "Evaluating received button interaction ID"
        );

        if custom_id == self.prev_id && self.current_page > 0 {
            self.current_page -= 1;
            debug!(new_page = self.current_page, "Page decremented");
            true
        } else if custom_id == self.next_id && self.current_page < self.total_pages - 1 {
            self.current_page += 1;
            debug!(new_page = self.current_page, "Page incremented");
            true
        } else {
            trace!(custom_id, "Interaction ignored (does not match expected active IDs)");
            false
        }
    }
}

async fn send_initial_reply<'a, F>(
    ctx: Context<'a>,
    make_embed: F,
    pagination_state: &PaginationState,
) -> Result<Option<ReplyHandle<'a>>, Error>
where
    F: Fn(usize) -> serenity::all::CreateEmbed + Send + Sync,
{
    if pagination_state.total_pages > 1 {
        trace!("Sending initial multi-page reply with components");
        let handle = ctx
            .send(
                poise::CreateReply::default()
                    .embed(make_embed(pagination_state.current_page()))
                    .components(pagination_state.create_components())
                    .ephemeral(true),
            )
            .await?;
        Ok(Some(handle))
    } else {
        trace!("Sending single-page reply without components");
        ctx.send(
            poise::CreateReply::default()
                .embed(make_embed(pagination_state.current_page()))
                .ephemeral(true),
        )
            .await?;
        Ok(None)
    }
}

fn get_stream_collector(ctx: &Context<'_>) -> impl Stream<Item=ComponentInteraction> {
    trace!(author_id = ctx.author().id.get(), "Initializing component interaction collector");
    serenity::all::ComponentInteractionCollector::new(ctx.serenity_context())
        .author_id(ctx.author().id)
        .timeout(std::time::Duration::from_secs(120))
        .stream()
}

/// Orchestrates the pagination process for an embed.
pub async fn paginate<F>(ctx: Context<'_>, total_pages: usize, make_embed: F) -> Result<(), Error>
where
    F: Fn(usize) -> serenity::all::CreateEmbed + Send + Sync,
{
    debug!(total_pages, ctx_id = ctx.id(), "Starting pagination handler");

    if total_pages == 0 {
        trace!("Zero pages provided, skipping execution");
        return Ok(());
    }

    let mut state = PaginationState::new(ctx.id(), total_pages);

    let Some(reply) = send_initial_reply(ctx, &make_embed, &state).await? else {
        debug!("Only single page detected; skipping interaction loop");
        return Ok(());
    };

    debug!("Starting interactive loop for pagination stream");
    let mut collector = get_stream_collector(&ctx);

    while let Some(press) = collector.next().await {
        if !state.handle_interaction(&press.data.custom_id) {
            continue;
        }

        trace!(
            custom_id = press.data.custom_id,
            target_page = state.current_page(),
            "Sending message update response"
        );

        press
            .create_response(
                &ctx.serenity_context().http,
                serenity::all::CreateInteractionResponse::UpdateMessage(
                    serenity::all::CreateInteractionResponseMessage::new()
                        .embed(make_embed(state.current_page()))
                        .components(state.create_components()),
                ),
            )
            .await?;
    }

    debug!("Pagination stream ended (timeout); disabling button components");

    // Disable the buttons after timeout to indicate they are no longer active
    if let Err(err) = reply
        .edit(
            ctx,
            poise::CreateReply::default().components(state.create_disabled_components()),
        )
        .await
    {
        warn!(error = ?err, "Failed to disable pagination components after timeout");
    } else {
        trace!("Pagination components successfully disabled");
    }

    Ok(())
}