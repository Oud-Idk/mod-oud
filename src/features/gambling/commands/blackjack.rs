use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::economy;
use crate::features::gambling::database::get_gambling_config;
use crate::features::gambling::games::cards::{DEALER_LIMIT, Deck, Hand, Rank};
use crate::features::gambling::validation::warn_non_player;
use crate::features::gambling::{
    GamblingConfig, release_gambling_cooldown, try_acquire_gambling_cooldown,
};
use crate::shared::messages::send_ephemeral;
use serenity::all::{
    ButtonStyle, CreateActionRow, CreateButton, CreateEmbed, CreateInteractionResponse,
    CreateInteractionResponseMessage, Message,
};
use std::time::Duration;
use tokio_stream::StreamExt;
use tracing::warn;

pub struct BlackjackGame {
    pub deck: Deck,
    pub dealer_hand: Hand,
    pub player_hands: Vec<Hand>,
    pub user_cash: i64,
    pub bet: i64,
}

impl BlackjackGame {
    pub fn new(bet: i64, user_cash: i64) -> Self {
        let mut deck = Deck::new_shuffled();
        let mut player_hand = Hand::default();
        let mut dealer_hand = Hand::default();

        // Initial deal
        player_hand.cards.push(deck.draw());
        dealer_hand.cards.push(deck.draw());
        player_hand.cards.push(deck.draw());
        dealer_hand.cards.push(deck.draw());

        Self {
            deck,
            dealer_hand,
            player_hands: vec![player_hand],
            user_cash,
            bet,
        }
    }

    /// Dealer hits until limit (only if at least one player hand didn't bust).
    pub fn resolve_dealer(&mut self) {
        if self.player_hands.iter().any(|h| !h.is_bust()) {
            while self.dealer_hand.points() < DEALER_LIMIT {
                self.dealer_hand.cards.push(self.deck.draw());
            }
        }
    }

    /// Calculate total payout and outcome message lines for all hands.
    pub fn calculate_payouts(&self) -> (i64, String) {
        let dealer_points = self.dealer_hand.points();
        let dealer_busted = self.dealer_hand.is_bust();
        let mut total_payout = 0;
        let mut lines = Vec::new();

        for (i, hand) in self.player_hands.iter().enumerate() {
            let pts = hand.points();
            let hand_bet = if hand.is_doubled {
                self.bet * 2
            } else {
                self.bet
            };

            let (msg, payout) = if hand.is_bust() {
                (format!("Hand {}: Busted! 💀", i + 1), 0)
            } else if dealer_busted {
                (format!("Hand {}: Dealer busted!", i + 1), hand_bet * 2)
            } else if pts > dealer_points {
                (format!("Hand {}: Higher score!", i + 1), hand_bet * 2)
            } else if pts < dealer_points {
                (format!("Hand {}: Dealer wins.", i + 1), 0)
            } else {
                (format!("Hand {}: Push.", i + 1), hand_bet)
            };

            lines.push(msg);
            total_payout += payout;
        }

        (total_payout, lines.join("\n"))
    }
}

#[poise::command(slash_command, guild_only)]
pub async fn blackjack(
    ctx: Context<'_>,
    #[description = "The amount to bet"] bet: i64,
) -> Result<(), Error> {
    let Some((cfg, starting_cash)) = validate_and_start(&ctx, bet).await? else {
        return Ok(());
    };

    let guild_id = ctx.guild_id().unwrap();
    let user_id = ctx.author().id;
    let db = &ctx.data().core.db;
    let mut game = BlackjackGame::new(bet, starting_cash);

    // Instant Natural Blackjack Check
    let player_bj = game.player_hands[0].is_natural_blackjack();
    let dealer_bj = game.dealer_hand.is_natural_blackjack();

    if player_bj || dealer_bj {
        let (outcome_text, payout) = match (player_bj, dealer_bj) {
            (true, true) => ("Both hit Blackjack! It's a **Push**.", bet),
            (true, false) => (
                "**Natural Blackjack!** You won 3:2 payout!",
                bet + (bet * 3 / 2),
            ),
            _ => ("Dealer hit Natural Blackjack. Better luck next time!", 0),
        };

        if payout > 0 {
            game.user_cash = economy::add_cash(db, guild_id, user_id, payout).await?.cash;
        }

        let embed = render_game_embed(&ctx, &game, 0, Some(outcome_text), false);
        ctx.send(poise::CreateReply::default().embed(embed)).await?;
        return Ok(());
    }

    // Initial Interactive Message
    let initial_embed = render_game_embed(&ctx, &game, 0, None, true);
    let components = build_buttons(&game.player_hands, 0, game.user_cash, bet);
    let reply = ctx
        .send(
            poise::CreateReply::default()
                .embed(initial_embed)
                .components(components),
        )
        .await?;

    let mut message = reply.into_message().await?;
    let completed =
        run_player_turns(&ctx, &message, &mut game, cfg.effective_timeout_secs()).await?;

    // Resolution or Timeout
    let outcome_text = if completed {
        game.resolve_dealer();
        let (payout, text) = game.calculate_payouts();
        if payout > 0 {
            game.user_cash = economy::add_cash(db, guild_id, user_id, payout).await?.cash;
        }
        text
    } else {
        "⏰ **Game timed out.** Your bet was forfeited!".to_string()
    };

    let final_embed = render_game_embed(
        &ctx,
        &game,
        game.player_hands.len(),
        Some(&outcome_text),
        false,
    );
    message
        .edit(
            ctx.serenity_context(),
            serenity::all::EditMessage::new()
                .embed(final_embed)
                .components(vec![]),
        )
        .await?;

    Ok(())
}

/// Validates command precondition guards and deducts initial bet.
async fn validate_and_start(
    ctx: &Context<'_>,
    bet: i64,
) -> Result<Option<(GamblingConfig, i64)>, Error> {
    let Some(cfg) = get_gambling_config(ctx).await? else {
        send_ephemeral(ctx, "Gambling is disabled in this server.").await?;
        return Ok(None);
    };
    if !cfg.is_game_enabled(cfg.blackjack.enabled) {
        send_ephemeral(ctx, "Blackjack is disabled in this server.").await?;
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

    ctx.defer().await?;

    let guild_id = ctx.guild_id().unwrap();
    let user_id = ctx.author().id;
    let db = &ctx.data().core.db;

    let Some(user_balance) = economy::deduct_cash(db, guild_id, user_id, bet).await? else {
        release_gambling_cooldown(ctx).await;
        send_ephemeral(
            ctx,
            "You don't have enough cash in your wallet for this bet.",
        )
        .await?;
        return Ok(None);
    };

    Ok(Some((cfg, user_balance.cash)))
}

/// Runs the interactive interaction stream for player decisions.
async fn run_player_turns(
    ctx: &Context<'_>,
    message: &Message,
    game: &mut BlackjackGame,
    timeout_secs: u64,
) -> Result<bool, Error> {
    let guild_id = ctx.guild_id().unwrap();
    let user_id = ctx.author().id;
    let db = &ctx.data().core.db;

    let mut current_hand_idx = 0;
    let mut stream = message
        .await_component_interactions(ctx.serenity_context())
        .timeout(Duration::from_secs(timeout_secs))
        .stream();

    while let Some(interaction) = stream.next().await {
        if warn_non_player(ctx, &interaction, user_id).await? {
            continue;
        }

        match interaction.data.custom_id.as_str() {
            "bj_hit" => {
                let hand = &mut game.player_hands[current_hand_idx];
                hand.cards.push(game.deck.draw());
                if hand.is_bust() {
                    current_hand_idx += 1;
                }
            }
            "bj_stand" => {
                game.player_hands[current_hand_idx].is_stood = true;
                current_hand_idx += 1;
            }
            "bj_double" => {
                if economy::deduct_cash(db, guild_id, user_id, game.bet)
                    .await?
                    .is_some()
                {
                    game.user_cash -= game.bet;
                    let hand = &mut game.player_hands[current_hand_idx];
                    hand.is_doubled = true;
                    hand.cards.push(game.deck.draw());
                    current_hand_idx += 1;
                }
            }
            "bj_split" => {
                if economy::deduct_cash(db, guild_id, user_id, game.bet)
                    .await?
                    .is_some()
                {
                    game.user_cash -= game.bet;
                    let second_card = game.player_hands[0].cards.pop().unwrap();
                    let mut new_hand = Hand::default();
                    new_hand.cards.push(second_card);

                    game.player_hands[0].cards.push(game.deck.draw());
                    new_hand.cards.push(game.deck.draw());
                    game.player_hands.push(new_hand);

                    // Special rule: Split aces only receive 1 card each
                    if game.player_hands[0].cards[0].rank == Rank::Ace {
                        game.player_hands[0].is_stood = true;
                        game.player_hands[1].is_stood = true;
                        current_hand_idx = 2;
                    }
                }
            }
            _ => warn!(
                custom_id = interaction.data.custom_id,
                "Unknown custom_id for blackjack!"
            ),
        }

        if current_hand_idx >= game.player_hands.len() {
            return Ok(true);
        }

        let embed = render_game_embed(ctx, game, current_hand_idx, None, true);
        let components = build_buttons(
            &game.player_hands,
            current_hand_idx,
            game.user_cash,
            game.bet,
        );

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
    }

    Ok(false)
}

fn build_buttons(
    hands: &[Hand],
    current_idx: usize,
    user_cash: i64,
    initial_bet: i64,
) -> Vec<CreateActionRow> {
    if current_idx >= hands.len() {
        return vec![];
    }

    let hand = &hands[current_idx];
    let can_double = hand.cards.len() == 2 && user_cash >= initial_bet && !hand.is_doubled;
    let can_split = hands.len() == 1 && hand.can_split() && user_cash >= initial_bet;

    let row = CreateActionRow::Buttons(vec![
        CreateButton::new("bj_hit")
            .label("Hit")
            .style(ButtonStyle::Primary),
        CreateButton::new("bj_stand")
            .label("Stand")
            .style(ButtonStyle::Success),
        CreateButton::new("bj_double")
            .label("Double Down")
            .style(ButtonStyle::Secondary)
            .disabled(!can_double),
        CreateButton::new("bj_split")
            .label("Split")
            .style(ButtonStyle::Danger)
            .disabled(!can_split),
    ]);

    vec![row]
}

fn render_game_embed(
    ctx: &Context<'_>,
    game: &BlackjackGame,
    current_idx: usize,
    outcome: Option<&str>,
    hide_dealer: bool,
) -> CreateEmbed {
    let dealer_display = game.dealer_hand.display(hide_dealer);
    let dealer_score = if hide_dealer {
        if game.dealer_hand.cards.len() > 1 {
            game.dealer_hand.cards[1].rank.value().to_string()
        } else {
            "?".to_string()
        }
    } else {
        game.dealer_hand.points().to_string()
    };

    let mut embed = CreateEmbed::new()
        .title("Blackjack")
        .color(BRAND_COLOR)
        .field(
            "Dealer's Hand",
            format!("{dealer_display}\n**Score:** {dealer_score}"),
            false,
        );

    for (i, hand) in game.player_hands.iter().enumerate() {
        let prefix = if i == current_idx && outcome.is_none() {
            "➡️ "
        } else if hand.is_bust() {
            "💀 "
        } else {
            ""
        };

        let status = if hand.is_bust() {
            " (Busted)"
        } else if hand.is_doubled {
            " (Doubled Down)"
        } else if hand.is_stood {
            " (Stood)"
        } else {
            ""
        };

        embed = embed.field(
            format!(
                "{prefix}{} - Hand {}{status}",
                ctx.author().display_name(),
                i + 1
            ),
            format!("{}\n**Score:** {}", hand.display(false), hand.points()),
            false,
        );
    }

    if let Some(msg) = outcome {
        embed = embed.description(format!(
            "### {msg}\n\n**Wallet Balance:** {}",
            game.user_cash
        ));
    } else {
        embed = embed.description(format!(
            "**Bet:** {} | **Wallet Balance:** {}",
            game.bet, game.user_cash
        ));
    }

    embed
}
