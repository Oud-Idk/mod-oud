use crate::events::handlers::tickets::handler::TicketLogPayload;
use crate::jobs;
use crate::types::config::config::GuildSettings;
use fred::clients::{Client, SubscriberClient};
use moka::future::Cache;
use serenity::all::Context;
use sqlx::{Pool, Postgres};
use tokio::sync::mpsc::UnboundedReceiver;

pub fn start_jobs(pool: &Pool<Postgres>, redis_client: &Client, subscriber_client: &SubscriberClient, guild_configs_cache: &Cache<i64, GuildSettings>, ctx: &Context, active_tickets_cache: &Cache<u64, ()>, rx: UnboundedReceiver<TicketLogPayload>) {
    jobs::sync_tickets::sync_tickets(
        &redis_client,
        &subscriber_client,
        &active_tickets_cache
    );

    jobs::temp_ban::start_temp_ban_worker(
        pool.clone(),
        ctx.http.clone(),
        redis_client.clone()
    );

    jobs::ticket_inactivity::start_ticket_inactivity_worker(
        pool.clone(),
        ctx.http.clone(),
        redis_client.clone(),
        guild_configs_cache.clone(),
    );

    jobs::flush_levels::start_level_flush_worker(
        pool.clone(),
        redis_client.clone()
    );

    jobs::ticket_logger::start_ticket_logger(rx, pool.clone());

    jobs::reminder::start_reminder_worker(pool.clone(), ctx.http.clone(), redis_client.clone());
}