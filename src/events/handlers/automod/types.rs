use serenity::all::Action;
use std::fmt;

pub enum LoggedAction {
    Delete,
    RemindPrivately,
    Timeout,
    Unknown,
}

impl From<&Action> for LoggedAction {
    fn from(action: &Action) -> Self {
        match action {
            Action::BlockMessage { .. } => Self::Delete,
            Action::Alert { .. } => Self::RemindPrivately,
            Action::Timeout(_) => Self::Timeout,
            _ => Self::Unknown,
        }
    }
}

impl LoggedAction {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Delete => "delete",
            Self::RemindPrivately => "remind_privately",
            Self::Timeout => "timeout",
            Self::Unknown => "unknown",
        }
    }
}

impl fmt::Display for LoggedAction {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}