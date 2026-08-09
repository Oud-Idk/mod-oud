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
            WebError::BadRequest(s) => (StatusCode::BAD_REQUEST, s),
            WebError::Internal => (StatusCode::INTERNAL_SERVER_ERROR, "internal server error".to_string()),
            WebError::BadGateway(s) => (StatusCode::BAD_GATEWAY, s),
        };
        (status, msg).into_response()
    }
}

impl From<(StatusCode, String)> for WebError {
    fn from((status, msg): (StatusCode, String)) -> Self {
        if status.is_client_error() {
            WebError::BadRequest(msg)
        } else {
            WebError::BadGateway(msg)
        }
    }
}

impl From<fred::error::Error> for WebError {
    fn from(_err: fred::error::Error) -> Self {
        WebError::Internal
    }
}

// Handle time arithmetic errors
impl From<std::time::SystemTimeError> for WebError {
    fn from(_err: std::time::SystemTimeError) -> Self {
        WebError::Internal
    }
}