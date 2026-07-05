/// Helper macro to fetch common moderation context (Guild Context, Member, Settings)
#[macro_export] macro_rules! fetch_mod_ctx {
    ($db:expr, $redis_conn:expr, $config_cache:expr, $http:expr, $guild_id:expr, $user_id:expr) => {{
        let gctx_fut = async {
            get_guild_ctx($guild_id, $http.as_ref()).await
                .map_err(|e| -> crate::types::Error { e.into() })
        };

        let member_fut = async {
            $http.get_member($guild_id, $user_id).await
                .map_err(|e| -> crate::types::Error { e.into() })
        };

        let settings_fut = async {
            get_settings($db, $redis_conn, $config_cache, $guild_id.get() as i64).await
                .map_err(|e| -> crate::types::Error { e.into() })
        };

        tokio::try_join!(gctx_fut, member_fut, settings_fut)?
    }};
}

/// Helper macro to handle building, falling back, and sending moderation DMs
#[macro_export] macro_rules! send_mod_dm {
    (
        $http:expr,
        $user_id:expr,
        $dm_settings_opt:expr,
        $action_name:expr,
        $replace_closure:expr,
        $default_embed_block:expr
    ) => {{
        let mut custom_msg_opt = None;

        if let Some(dm_settings) = $dm_settings_opt {
            if dm_settings.enabled {
                let is_embed = matches!(dm_settings.format, Format::Embed);

                custom_msg_opt = build_custom_message(
                    is_embed,
                    Some(&dm_settings.content),
                    dm_settings.embed.as_ref(),
                    $replace_closure,
                ).unwrap_or_else(|e| {
                    tracing::error!(error = %e, action = $action_name, "Failed to build custom moderation DM");
                    None
                });
            }
        }

        let dm_message = custom_msg_opt.unwrap_or_else(|| {
            CreateMessage::new().embed($default_embed_block)
        });

        match $user_id.dm($http, dm_message).await {
            Ok(_) => {
                tracing::debug!(user_id = %$user_id, action = $action_name, "Successfully sent moderation DM to user");
            }
            Err(e) => {
                tracing::warn!(
                    user_id = %$user_id,
                    action = $action_name,
                    error = ?e,
                    "Failed to send moderation DM to user (DMs may be closed)"
                );
            }
        }
    }};
}
