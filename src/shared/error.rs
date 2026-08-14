/// Returns `true` if the given serenity error is the "unknown message" (10008)
/// error, e.g. when a message was already deleted.
pub const fn is_unknown_message_error(err: &serenity::Error) -> bool {
    if let serenity::Error::Http(http_err) = err
        && let serenity::all::HttpError::UnsuccessfulRequest(error_response) = http_err {
            return error_response.error.code == 10008;
        }
    false
}