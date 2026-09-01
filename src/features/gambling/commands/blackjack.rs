use crate::constants::BRAND_COLOR;
use crate::core::config::state::{Context, Error};
use crate::features::economy;
use crate::features::gambling::database::get_gambling_config;
use crate::features::gambling::games::cards::{DEALER_LIMIT, Deck, Hand, Rank};
use crate::features::gambling::validation::warn_non_player;
use crate::features::gambling::{release_gambling_cooldown, try_acquire_gambling_cooldown};
use crate::shared::messages::send_ephemeral;
use serenity::all::{
    ButtonStyle, CreateActionRow, CreateButton, CreateEmbed, CreateInteractionResponse,
    CreateInteractionResponseMessage, Message,
};
use std::time::Duration;
use tokio_stream::StreamExt;
use tracing::warn;

#[poise::command(slash_command, guild_only)]
pub async fn blackjack(
    ctx: Context<'_>,
    #[description = "The amount to bet"] bet: i64,
) -> Result<(), Error> {
    let Some(cfg) = get_gambling_config(&ctx).await? else {
        send_ephemeral(&ctx, "Gambling is disabled in this server.").await?;
        return Ok(());
    };
    if !cfg.is_game_enabled(cfg.blackjack.enabled) {
        send_ephemeral(&ctx, "Blackjack is disabled in this server.").await?;
        return Ok(());
    }
    if bet <= 0 {
        send_ephemeral(&ctx, "Bet amount must be greater than 0.").await?;
        return Ok(());
    }
    if let Some(msg) = cfg.validate_bet(bet) {
        send_ephemeral(&ctx, msg).await?;
        return Ok(());
    }
    if let Some(wait) = try_acquire_gambling_cooldown(&ctx, &cfg).await? {
        send_ephemeral(&ctx, wait).await?;
        return Ok(());
    }
    let timeout_secs = cfg.effective_timeout_secs();

    ctx.defer().await?;

    let guild_id = ctx.guild_id().unwrap();
    let user_id = ctx.author().id;
    let db = &ctx.data().core.db;

    // Deduct initial bet up front
    let Some(mut user_balance) = economy::deduct_cash(db, guild_id, user_id, bet).await? else {
        let _ = release_gambling_cooldown(&ctx).await;
        send_ephemeral(&ctx, "You don't have enough cash in your wallet for this bet.").await?;
        return Ok(());
    };

    let mut deck = Deck::new_shuffled();
    let mut dealer_hand = Hand::default();
    let mut player_hands = vec![Hand::default()];

    // Initial Deal
    player_hands[0].cards.push(deck.draw());
    dealer_hand.cards.push(deck.draw());
    player_hands[0].cards.push(deck.draw());
    dealer_hand.cards.push(deck.draw());

    // Instant Natural Blackjack Check
    let player_bj = player_hands[0].is_natural_blackjack();
    let dealer_bj = dealer_hand.is_natural_blackjack();

    if player_bj || dealer_bj {
        let (outcome_text, payout) = if player_bj && dealer_bj {
            ("Both you and the dealer hit Blackjack! It's a **Push**.", bet)
        } else if player_bj {
            let win = bet + (bet * 3 / 2); // 3:2 payout + bet returned
            ("**Natural Blackjack!** You won 3:2 payout!", win)
        } else {
            ("Dealer hit Natural Blackjack. Better luck next time!", 0)
        };

        if payout > 0 {
            user_balance = economy::add_cash(db, guild_id, user_id, payout).await?;
        }

        let embed = render_game_embed(
            &ctx,
            &dealer_hand,
            &player_hands,
            0,
            bet,
            user_balance.cash,
            Some(outcome_text),
            false,
        );

        ctx.send(poise::CreateReply::default().embed(embed)).await?;
        return Ok(());
    }

    // Send initial interactive message
    let initial_embed = render_game_embed(
        &ctx,
        &dealer_hand,
        &player_hands,
        0,
        bet,
        user_balance.cash,
        None,
        true,
    );
    let components = build_buttons(&player_hands, 0, user_balance.cash, bet);
    let reply = ctx
        .send(
            poise::CreateReply::default()
                .embed(initial_embed)
                .components(components),
        )
        .await?;

    let mut message = reply.into_message().await?;

    let completed = run_player_turns(
        &ctx,
        &mut message,
        &mut deck,
        &dealer_hand,
        &mut player_hands,
        &mut user_balance.cash,
        bet,
        timeout_secs,
    )
        .await?;

    // Resolution
    if completed {
        // Dealer only hits if at least one player hand did not bust
        let any_hand_active = player_hands.iter().any(|h| !h.is_bust());
        if any_hand_active {
            while dealer_hand.points() < DEALER_LIMIT {
                dealer_hand.cards.push(deck.draw());
            }
        }

        let dealer_points = dealer_hand.points();
        let dealer_busted = dealer_hand.is_bust();
        let mut total_payout = 0;
        let mut outcome_lines = Vec::new();

        for (i, hand) in player_hands.iter().enumerate() {
            let pts = hand.points();
            let hand_bet = if hand.is_doubled { bet * 2 } else { bet };

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

            outcome_lines.push(msg);
            total_payout += payout;
        }

        if total_payout > 0 {
            user_balance = economy::add_cash(db, guild_id, user_id, total_payout).await?;
        }

        let result_text = outcome_lines.join("\n");
        let embed = render_game_embed(
            &ctx,
            &dealer_hand,
            &player_hands,
            player_hands.len(),
            bet,
            user_balance.cash,
            Some(&result_text),
            false,
        );

        message
            .edit(
                ctx.serenity_context(),
                serenity::all::EditMessage::new()
                    .embed(embed)
                    .components(vec![]),
            )
            .await?;
    } else {
        // Timeout handling: Disables buttons and leaves cards showing forfeit
        let timeout_embed = render_game_embed(
            &ctx,
            &dealer_hand,
            &player_hands,
            player_hands.len(),
            bet,
            user_balance.cash,
            Some("⏰ **Game timed out.** Your bet was forfeited!"),
            false,
        );

        message
            .edit(
                ctx.serenity_context(),
                serenity::all::EditMessage::new()
                    .embed(timeout_embed)
                    .components(vec![]),
            )
            .await?;
    }

    Ok(())
}

/// Runs the interactive interaction stream for player decisions (Hit, Stand, Double, Split).
/// Returns `Ok(true)` if all hands finished, or `Ok(false)` if the stream timed out.
async fn run_player_turns(
    ctx: &Context<'_>,
    message: &mut Message,
    deck: &mut Deck,
    dealer_hand: &Hand,
    player_hands: &mut Vec<Hand>,
    user_cash: &mut i64,
    bet: i64,
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
                let hand = &mut player_hands[current_hand_idx];
                hand.cards.push(deck.draw());

                if hand.is_bust() {
                    current_hand_idx += 1;
                }
            }
            "bj_stand" => {
                player_hands[current_hand_idx].is_stood = true;
                current_hand_idx += 1;
            }
            "bj_double" => {
                if economy::deduct_cash(db, guild_id, user_id, bet).await?.is_some() {
                    *user_cash -= bet;
                    let hand = &mut player_hands[current_hand_idx];
                    hand.is_doubled = true;
                    hand.cards.push(deck.draw());
                    current_hand_idx += 1;
                }
            }
            "bj_split" => {
                if economy::deduct_cash(db, guild_id, user_id, bet).await?.is_some() {
                    *user_cash -= bet;
                    let second_card = player_hands[0].cards.pop().unwrap();
                    let mut new_hand = Hand::default();
                    new_hand.cards.push(second_card);

                    player_hands[0].cards.push(deck.draw());
                    new_hand.cards.push(deck.draw());
                    player_hands.push(new_hand);

                    // Special rule: Split aces only receive 1 card each
                    if player_hands[0].cards[0].rank == Rank::Ace {
                        player_hands[0].is_stood = true;
                        player_hands[1].is_stood = true;
                        current_hand_idx = 2; // trigger dealer resolution
                    }
                }
            }
            _ => {
                warn!(
                    custom_id = interaction.data.custom_id,
                    "Unknown custom_id for blackjack!"
                );
            }
        }

        // Check if all player hands are played out
        if current_hand_idx >= player_hands.len() {
            return Ok(true);
        }

        let embed = render_game_embed(
            ctx,
            dealer_hand,
            player_hands,
            current_hand_idx,
            bet,
            *user_cash,
            None,
            true,
        );
        let components = build_buttons(player_hands, current_hand_idx, *user_cash, bet);

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

    // If the loop finished without hitting the break condition, it timed out!
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

#[allow(clippy::too_many_arguments)]
fn render_game_embed(
    ctx: &Context<'_>,
    dealer: &Hand,
    player_hands: &[Hand],
    current_idx: usize,
    bet: i64,
    cash: i64,
    outcome: Option<&str>,
    hide_dealer: bool,
) -> CreateEmbed {
    let dealer_display = dealer.display(hide_dealer);
    let dealer_score = if hide_dealer {
        if dealer.cards.len() > 1 {
            dealer.cards[1].rank.value().to_string()
        } else {
            "?".to_string()
        }
    } else {
        dealer.points().to_string()
    };

    let mut embed = CreateEmbed::new()
        .title("Blackjack")
        .color(BRAND_COLOR)
        .field(
            "Dealer's Hand",
            format!("{dealer_display}\n**Score:** {dealer_score}"),
            false,
        );

    for (i, hand) in player_hands.iter().enumerate() {
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
            format!("{prefix}{} - Hand {}{status}", ctx.author().display_name(), i + 1),
            format!("{}\n**Score:** {}", hand.display(false), hand.points()),
            false,
        );
    }

    if let Some(msg) = outcome {
        embed = embed.description(format!("### {msg}\n\n**Wallet Balance:** {cash}"));
    } else {
        embed = embed.description(format!("**Bet:** {bet} | **Wallet Balance:** {cash}"));
    }

    embed
}