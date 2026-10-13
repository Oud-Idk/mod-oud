use super::GuildCommand;
use async_trait::async_trait;
use songbird::events::{Event, EventContext, EventHandler as VoiceEventHandler};
use tokio::sync::mpsc;

pub(super) struct DriverDisconnectHandler {
    pub(super) command_tx: mpsc::Sender<GuildCommand>,
}

#[async_trait]
impl VoiceEventHandler for DriverDisconnectHandler {
    async fn act(&self, _ctx: &EventContext<'_>) -> Option<Event> {
        let (respond_tx, _) = tokio::sync::oneshot::channel();
        let _ = self
            .command_tx
            .send(GuildCommand::Stop {
                respond: respond_tx,
            })
            .await;
        None
    }
}
