use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};

pub enum WebError {
    BadRequest(String),
    Internal(String),
    BadGateway(String),
}

impl IntoResponse for WebError {
    fn into_response(self) -> Response {
        let (status, msg) = match self {
            WebError::BadRequest(s) => (StatusCode::BAD_REQUEST, s),
            WebError::Internal(s) => (StatusCode::INTERNAL_SERVER_ERROR, s),
            WebError::BadGateway(s) => (StatusCode::BAD_GATEWAY, s),
        };
        (status, msg).into_response()
    }
}

// Convert Reqwest status tuple (from getters) to WebError
impl From<(StatusCode, String)> for WebError {
    fn from((status, msg): (reqwest::StatusCode, String)) -> Self {
        if status.is_client_error() {
            WebError::BadRequest(msg)
        } else {
            WebError::BadGateway(msg)
        }
    }
}

// Handle Redis errors
impl From<redis::RedisError> for WebError {
    fn from(err: redis::RedisError) -> Self {
        WebError::Internal(err.to_string())
    }
}

// Handle time arithmetic errors
impl From<std::time::SystemTimeError> for WebError {
    fn from(err: std::time::SystemTimeError) -> Self {
        WebError::Internal(err.to_string())
    }
}