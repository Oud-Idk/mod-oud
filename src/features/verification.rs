mod captcha;
mod events;
mod signing;
mod types;
mod web;

pub use events::send_verification_link;
pub use signing::generate_verification_link;
pub use types::{CaptchaType, VerificationSettings};
pub use web::routes;
