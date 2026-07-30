mod web;
mod signing;
mod captcha;
mod types;

pub use web::routes;
pub use types::{VerificationSettings, CaptchaType};
pub use signing::generate_verification_link;