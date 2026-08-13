use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

pub enum WebError {
    BadRequest(String),
    Internal,
    BadGateway(String),
}

impl IntoResponse for WebError {
    fn into_response(self) -> Response {
        let (status, msg) = match self {
            Self::BadRequest(s) => (StatusCode::BAD_REQUEST, s),
            Self::Internal => (StatusCode::INTERNAL_SERVER_ERROR, "internal server error".to_string()),
            Self::BadGateway(s) => (StatusCode::BAD_GATEWAY, s),
        };
        (status, msg).into_response()
    }
}

impl From<(StatusCode, String)> for WebError {
    fn from((status, msg): (StatusCode, String)) -> Self {
        if status.is_client_error() {
            Self::BadRequest(msg)
        } else {
            Self::BadGateway(msg)
        }
    }
}

impl From<fred::error::Error> for WebError {
    fn from(_err: fred::error::Error) -> Self {
        Self::Internal
    }
}

// Handle time arithmetic errors
impl From<std::time::SystemTimeError> for WebError {
    fn from(_err: std::time::SystemTimeError) -> Self {
        Self::Internal
    }
}