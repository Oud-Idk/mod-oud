use crate::types::{Data, Error};
pub async fn on_error(error: poise::FrameworkError<'_, Data, Error>) {
    match error {
        poise::FrameworkError::Setup { error, .. } => panic!("Failed to start bot: {:?}", error),
        poise::FrameworkError::Command { error, ctx, .. } => {
            // println!("Error in command `{}`: {:?}", ctx.command().name, error);
            let _ = ctx
                .send(
                    poise::CreateReply::default()
                        .content(format!("Something went wrong: {error}"))
                        .ephemeral(true),
                )
                .await;
        }
        error => {
            if let Err(e) = poise::builtins::on_error(error).await {
                // println!("Error while handling error: {}", e);
            }
        }
    }
}
