/// Helper macro to fetch common moderation context (Guild Context, Member, Settings)
#[macro_export]
macro_rules! fetch_mod_ctx {
    ($db:expr, $redis_conn:expr, $config_cache:expr, $http:expr, $guild_id:expr, $user_id:expr) => {{
        // Evaluate inputs once to avoid re-evaluation footguns & double borrows
        let http = &$http;
        let guild_id = $guild_id;
        let user_id = $user_id;
        let db = $db;
        let redis_conn = $redis_conn;
        let config_cache = $config_cache;

        let gctx_fut = async move {
            get_guild_ctx(guild_id, http.as_ref())
                .await
                .map_err(anyhow::Error::from)
        };

        let member_fut = async move {
            http.get_member(guild_id, user_id)
                .await
                .map_err(anyhow::Error::from)
        };

        let settings_fut = async move {
            get_settings(db, redis_conn, config_cache, guild_id)
                .await
                .map_err(anyhow::Error::from)
        };

        tokio::try_join!(gctx_fut, member_fut, settings_fut)?
    }};
}

/// Helper macro to handle building, falling back, and sending moderation DMs
#[macro_export]
macro_rules! send_mod_dm {
    (
        $http:expr,
        $user_id:expr,
        $dm_settings_opt:expr,
        $action_name:expr,
        $replace_closure:expr,
        $default_embed_block:expr
    ) => {{
        let http = $http;
        let user_id = $user_id;
        let action_name = $action_name;
        let dm_settings_opt = $dm_settings_opt;

        let mut custom_msg_opt = None;

        if let Some(dm_settings) = dm_settings_opt {
            if dm_settings.enabled {
                custom_msg_opt = build_custom_message(
                    dm_settings.message.format,
                    &dm_settings.message.content,
                    &dm_settings.message.embed,
                    $replace_closure,
                )
                .unwrap_or_else(|e| {
                    tracing::error!(
                        error = %e,
                        action = action_name,
                        "Failed to build custom moderation DM"
                    );
                    None
                });
            }
        }

        // $default_embed_block is only evaluated if custom_msg_opt is None!
        let dm_message = custom_msg_opt.unwrap_or_else(|| {
            CreateMessage::new().embed($default_embed_block)
        });

        match user_id.dm(http, dm_message).await {
            Ok(_) => {
                tracing::debug!(
                    %user_id,
                    action = action_name,
                    "Successfully sent moderation DM to user"
                );
            }
            Err(e) => {
                tracing::warn!(
                    %user_id,
                    action = action_name,
                    error = ?e,
                    "Failed to send moderation DM to user (DMs may be closed)"
                );
            }
        }
    }};
}
