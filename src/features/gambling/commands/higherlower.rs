use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::economy;
use crate::features::gambling::audit;
use crate::features::gambling::database::get_gambling_config;
use crate::features::gambling::games::cards::{Card, Deck};
use crate::features::gambling::games::higherlower::{Guess, is_correct, payout_for_streak};
use crate::features::gambling::validation::warn_non_player;
use crate::features::gambling::{release_gambling_cooldown, try_acquire_gambling_cooldown};
use crate::shared::messages::send_ephemeral;
use serenity::all::{
    ButtonStyle, CreateActionRow, CreateButton, CreateEmbed, CreateInteractionResponse,
    CreateInteractionResponseMessage, Message,
};
use serenity::model::application::ComponentInteraction;
use std::time::Duration;
use tokio::time::timeout;
use tokio_stream::StreamExt;
use tracing::{error, warn};

/// Recorded on every audit line for this game.
const GAME: &str = "higherlower";

/// Play Higher or Lower, guess if the next card is higher or lower than the current one.
///
/// Streak builds linearly: each correct guess increases your total return to
/// `bet * (streak + 1)`. Cash out anytime to collect, or risk it for the next card.
/// Ties (same rank) lose.
#[poise::command(slash_command, guild_only)]
pub async fn higherlower(
    ctx: Context<'_>,
    #[description = "The amount to bet"] bet: i64,
) -> Result<(), Error> {
    let Some((timeout_secs, max_streak)) = preflight(&ctx, bet).await? else {
        return Ok(());
    };

    ctx.defer().await?;

    let guild_id = ctx.guild_id().unwrap();
    let user_id = ctx.author().id;
    let db = &ctx.data().core.db;

    let Some(mut balance) = economy::deduct_cash(db, guild_id, user_id, bet).await? else {
        release_gambling_cooldown(&ctx).await;
        audit::bet_rejected(GAME, guild_id, user_id, bet, "insufficient_funds");
        send_ephemeral(
            &ctx,
            "You don't have enough cash in your wallet for this bet.",
        )
        .await?;
        return Ok(());
    };

    let mut deck = Deck::new_shuffled();
    let mut current_card = deck.draw();
    let mut streak: u32 = 0;
    let mut history: Vec<Card> = vec![current_card];

    let initial_embed = render_embed(
        &ctx,
        current_card,
        &history,
        streak,
        bet,
        balance.cash,
        None,
    );
    let components = build_components(streak);

    let reply = ctx
        .send(
            poise::CreateReply::default()
                .embed(initial_embed)
                .components(components),
        )
        .await?;

    let mut message = reply.into_message().await?;
    let states = HigherLowerStates {
        message: &mut message,
        deck: &mut deck,
        current_card: &mut current_card,
        streak: &mut streak,
        history: &mut history,
        user_cash: &mut balance.cash,
    };

    // Run the interactive guessing loop
    audit::bet_placed(GAME, guild_id, user_id, bet, "first card dealt");

    match run_game_loop(&ctx, bet, max_streak, states, timeout_secs).await? {
        GameEnd::Settled => {}
        GameEnd::TimedOut => {
            audit::bet_forfeited(
                GAME,
                guild_id,
                user_id,
                bet,
                "no_settlement_reached",
                &format!(
                    "streak={streak} cards_played={} timeout_secs={timeout_secs}",
                    history.len()
                ),
            );

            let timed_out_embed = render_embed(
                &ctx,
                current_card,
                &history,
                streak,
                bet,
                balance.cash,
                Some("**Game timed out.** Your bet was forfeited!"),
            );

            if let Err(e) = message
                .edit(
                    ctx.serenity_context(),
                    serenity::all::EditMessage::new()
                        .embed(timed_out_embed)
                        .components(vec![]),
                )
                .await
            {
                error!(
                    error = ?e,
                    error_chain = %format!("{e:#}"),
                    %guild_id,
                    %user_id,
                    "Failed to finalise a timed out higher/lower game; the buttons stay active"
                );
            }
        }
    }

    Ok(())
}

/// Validates the command and acquires the cooldown. `None` means the player has been told why
/// they cannot play, and the caller must stop without touching any balance.
async fn preflight(ctx: &Context<'_>, bet: i64) -> Result<Option<(u64, u32)>, Error> {
    let Some(cfg) = get_gambling_config(ctx).await? else {
        send_ephemeral(ctx, "Gambling is disabled in this server.").await?;
        return Ok(None);
    };
    if !cfg.is_game_enabled(cfg.higherlower.enabled) {
        send_ephemeral(ctx, "Higher/Lower is disabled in this server.").await?;
        return Ok(None);
    }
    if bet <= 0 {
        send_ephemeral(ctx, "Bet amount must be greater than 0.").await?;
        return Ok(None);
    }
    if let Some(msg) = cfg.validate_bet(bet) {
        send_ephemeral(ctx, msg).await?;
        return Ok(None);
    }
    if let Some(wait) = try_acquire_gambling_cooldown(ctx, &cfg).await {
        send_ephemeral(ctx, wait).await?;
        return Ok(None);
    }
    Ok(Some((
        cfg.effective_timeout_secs(),
        cfg.higherlower.effective_max_streak(),
    )))
}

struct HigherLowerStates<'a> {
    message: &'a mut Message,
    deck: &'a mut Deck,
    current_card: &'a mut Card,
    streak: &'a mut u32,
    history: &'a mut Vec<Card>,
    user_cash: &'a mut i64,
}

/// How a Higher/Lower game ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum GameEnd {
    /// The player lost a guess, cashed out, or hit the streak cap. The bet is settled.
    Settled,
    /// The interaction stream went quiet before the player settled. The bet is forfeited.
    TimedOut,
}

/// Runs guesses until the player settles or the stream goes quiet.
///
/// The timeout is per turn, so every guess gets the full window.
async fn run_game_loop(
    ctx: &Context<'_>,
    bet: i64,
    max_streak: u32,
    mut states: HigherLowerStates<'_>,
    timeout_secs: u64,
) -> Result<GameEnd, Error> {
    let user_id = ctx.author().id;

    let mut stream = states
        .message
        .await_component_interactions(ctx.serenity_context())
        .stream();

    loop {
        let Ok(Some(interaction)) = timeout(Duration::from_secs(timeout_secs), stream.next()).await
        else {
            return Ok(GameEnd::TimedOut);
        };

        if warn_non_player(ctx, &interaction, user_id, GAME).await? {
            continue;
        }

        let game_over = match interaction.data.custom_id.as_str() {
            "hl_higher" => {
                handle_guess(
                    ctx,
                    &interaction,
                    Guess::Higher,
                    bet,
                    max_streak,
                    &mut states,
                )
                .await?
            }
            "hl_lower" => {
                handle_guess(
                    ctx,
                    &interaction,
                    Guess::Lower,
                    bet,
                    max_streak,
                    &mut states,
                )
                .await?
            }
            "hl_cashout" => {
                handle_cashout(ctx, &interaction, bet, &mut states).await?;
                true
            }
            other => {
                warn!(
                    %user_id,
                    custom_id = other,
                    "Unknown custom_id for higher/lower"
                );
                continue;
            }
        };

        if game_over {
            return Ok(GameEnd::Settled);
        }
    }
}

/// Handles one guess. Returns `true` when the game is over.
async fn handle_guess(
    ctx: &Context<'_>,
    interaction: &ComponentInteraction,
    guess: Guess,
    bet: i64,
    max_streak: u32,
    states: &mut HigherLowerStates<'_>,
) -> Result<bool, Error> {
    if states.deck.is_empty() {
        *states.deck = Deck::new_shuffled();
    }

    let next_card = states.deck.draw();
    states.history.push(next_card);

    let is_win = is_correct(states.current_card.rank, next_card.rank, guess);

    if !is_win && let Some(guild_id) = ctx.guild_id() {
        audit::bet_settled(
            GAME,
            guild_id,
            ctx.author().id,
            bet,
            "loss",
            0,
            &format!(
                "guess={} streak={} cards_played={}",
                guess.label(),
                *states.streak,
                states.history.len()
            ),
        );
    }

    if is_win {
        *states.streak += 1;
        *states.current_card = next_card;

        // The payout escalator has no ceiling, so the streak has to be capped or a long streak
        // prints unlimited money. Reaching the cap pays out instead of asking for another guess.
        if *states.streak >= max_streak {
            let streak = *states.streak;
            let headline =
                format!("**Streak cap reached at {streak}.** Your bet was paid out automatically.");
            settle(ctx, interaction, bet, streak, "win", headline, states).await?;
            return Ok(true);
        }

        let embed = render_embed(
            ctx,
            *states.current_card,
            states.history,
            *states.streak,
            bet,
            *states.user_cash,
            None,
        );
        let components = build_components(*states.streak);

        interaction
            .create_response(
                ctx.serenity_context(),
                CreateInteractionResponse::UpdateMessage(
                    CreateInteractionResponseMessage::new()
                        .embed(embed)
                        .components(components),
                ),
            )
            .await?;

        Ok(false)
    } else {
        let tie_or_wrong = if next_card.rank == states.current_card.rank {
            "It's a tie, house wins."
        } else {
            "Wrong guess."
        };

        let result = format!(
            "You guessed **{}** but drew **{}**.\n{} was **{}**.\n\n**You lost!** Streak: {}",
            guess.label(),
            next_card.display(),
            tie_or_wrong,
            states.current_card.display(),
            states.streak
        );

        let embed = render_embed(
            ctx,
            next_card,
            states.history,
            *states.streak,
            bet,
            *states.user_cash,
            Some(&result),
        );

        interaction
            .create_response(
                ctx.serenity_context(),
                CreateInteractionResponse::UpdateMessage(
                    CreateInteractionResponseMessage::new()
                        .embed(embed)
                        .components(vec![]),
                ),
            )
            .await?;

        Ok(true)
    }
}

/// Handles the player tapping out and taking their cash.
async fn handle_cashout(
    ctx: &Context<'_>,
    interaction: &ComponentInteraction,
    bet: i64,
    states: &mut HigherLowerStates<'_>,
) -> Result<bool, Error> {
    let streak = *states.streak;
    let headline = if streak == 0 {
        format!("You cashed out immediately. Your **{bet}** bet was returned.")
    } else {
        "**Cashed out!**".to_string()
    };

    settle(
        ctx,
        interaction,
        bet,
        streak,
        if streak == 0 { "push" } else { "win" },
        headline,
        states,
    )
    .await?;

    Ok(true)
}

/// Pays out the current streak value and closes the game.
async fn settle(
    ctx: &Context<'_>,
    interaction: &ComponentInteraction,
    bet: i64,
    streak: u32,
    outcome: &'static str,
    headline: String,
    states: &mut HigherLowerStates<'_>,
) -> Result<(), Error> {
    let guild_id = ctx.guild_id().unwrap();
    let user_id = ctx.author().id;
    let db = &ctx.data().core.db;

    let Some(payout) = audit::resolve_payout(
        payout_for_streak(bet, streak),
        GAME,
        guild_id,
        user_id,
        bet,
        &format!("streak={streak}"),
    ) else {
        interaction
            .create_response(
                ctx.serenity_context(),
                CreateInteractionResponse::UpdateMessage(
                    CreateInteractionResponseMessage::new()
                        .content(audit::PAYOUT_OVERFLOW_MESSAGE)
                        .components(vec![]),
                ),
            )
            .await?;
        return Ok(());
    };

    let profit = payout.saturating_sub(bet);
    let new_balance = economy::add_cash(db, guild_id, user_id, payout).await?;
    *states.user_cash = new_balance.cash;

    audit::bet_settled(
        GAME,
        guild_id,
        user_id,
        bet,
        outcome,
        payout,
        &format!("streak={streak} profit={profit}"),
    );

    let result = format!(
        "{headline}\nStreak: **{streak}**\nTotal return **{payout}** (profit **+{profit}**).\n         **Wallet Balance:** {}",
        states.user_cash
    );

    let embed = render_embed(
        ctx,
        *states.current_card,
        states.history,
        streak,
        bet,
        *states.user_cash,
        Some(&result),
    );

    interaction
        .create_response(
            ctx.serenity_context(),
            CreateInteractionResponse::UpdateMessage(
                CreateInteractionResponseMessage::new()
                    .embed(embed)
                    .components(vec![]),
            ),
        )
        .await?;

    Ok(())
}

fn build_components(_streak: u32) -> Vec<CreateActionRow> {
    vec![CreateActionRow::Buttons(vec![
        CreateButton::new("hl_higher")
            .label("Higher")
            .style(ButtonStyle::Primary),
        CreateButton::new("hl_lower")
            .label("Lower")
            .style(ButtonStyle::Success),
        CreateButton::new("hl_cashout")
            .label("Cash Out")
            .style(ButtonStyle::Secondary),
    ])]
}

fn render_embed(
    ctx: &Context<'_>,
    current: Card,
    history: &[Card],
    streak: u32,
    bet: i64,
    cash: i64,
    outcome: Option<&str>,
) -> CreateEmbed {
    let potential = payout_for_streak(bet, streak).unwrap_or(bet);
    let profit = potential.saturating_sub(bet);

    let history_str = if history.len() <= 6 {
        history
            .iter()
            .map(|c| c.display())
            .collect::<Vec<_>>()
            .join(" → ")
    } else {
        let tail = &history[history.len() - 6..];
        format!(
            "... → {}",
            tail.iter()
                .map(|c| c.display())
                .collect::<Vec<_>>()
                .join(" → ")
        )
    };

    let mut embed = CreateEmbed::new()
        .title("Higher or Lower")
        .color(BRAND_COLOR)
        .field("Current Card", format!("**{}**", current.display()), true)
        .field("Streak", format!("**{streak}**"), true)
        .field(
            "Potential Return",
            if streak == 0 {
                format!("{potential} (push)")
            } else {
                format!("{potential} (+{profit} profit)")
            },
            true,
        )
        .field("History", history_str, false)
        .field("Bet", format!("{bet}"), true)
        .field("Wallet", format!("{cash}"), true);

    if let Some(msg) = outcome {
        embed = embed.description(format!("### {msg}"));
    } else {
        embed = embed.description(format!(
            "Will the next card be **Higher** or **Lower** than **{}**?\nTies lose, house wins on equal rank.\n\n**{}**, choose wisely!",
            current.display(),
            ctx.author().display_name()
        ));
    }

    embed
}
