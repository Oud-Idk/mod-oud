pub fn is_unknown_message_error(err: &serenity::Error) -> bool {
    if let serenity::Error::Http(http_err) = err {
        if let serenity::all::HttpError::UnsuccessfulRequest(error_response) = http_err {
            return error_response.error.code == 10008;
        }
    }
    false
}