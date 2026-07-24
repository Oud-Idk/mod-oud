use fred::clients::Client;
use fred::error;
use fred::interfaces::PubsubInterface;

pub async fn publish_report(redis_conn: &Client, payload_str: &str) -> Result<(), error::Error> {
    redis_conn
        .publish::<(), _, _>("discord:reports", payload_str)
        .await
}