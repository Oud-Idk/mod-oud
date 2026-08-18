use reqwest::Client;
use serde::Deserialize;

#[derive(Deserialize)]
struct HCaptchaResponse {
    success: bool,
    #[serde(rename = "error-codes")]
    error_codes: Option<Vec<String>>,
}

#[derive(serde::Deserialize, Debug)]
struct CloudflareResponse {
    success: bool,
    #[serde(rename = "error-codes")] // Cloudflare uses "error-codes" in JSON
    error_codes: Vec<String>,
}

pub async fn verify_hcaptcha_token(
    token: &str,
    ip: &str,
    client: &Client,
    secret: &str,
    site_key: &str,
) -> anyhow::Result<(bool, Vec<String>)> {
    let form = [
        ("secret", secret),
        ("response", token),
        ("remoteip", ip),
        ("sitekey", site_key),
    ];

    let response: HCaptchaResponse = client
        .post("https://api.hcaptcha.com/siteverify")
        .form(&form)
        .send()
        .await?
        .json()
        .await?;

    if response.success {
        return Ok((true, vec![]));
    }

    Ok((false, response.error_codes.unwrap_or_default()))
}

/// Verifies a Cloudflare Turnstile CAPTCHA token.
/// Returns `Ok((verified, reject_reasons))` on success, or a reqwest Error on network failure.
pub async fn verify_turnstile(
    client: &Client,
    secret_key: &str,
    token: &str,
) -> Result<(bool, Vec<String>), reqwest::Error> {
    let response = client
        .post("https://challenges.cloudflare.com/turnstile/v0/siteverify")
        .form(&[("secret", secret_key), ("response", token)])
        .send()
        .await?;

    let cf_response: CloudflareResponse = response.json().await.unwrap_or(CloudflareResponse {
        success: false,
        error_codes: Vec::new(),
    });

    Ok((cf_response.success, cf_response.error_codes))
}
