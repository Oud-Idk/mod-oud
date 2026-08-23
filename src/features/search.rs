mod commands;
mod events;
mod giphy;
mod kitsu;
mod klipy;
mod pick;
mod spotify;
mod urban;
mod youtube;
mod genius;
mod tmdb;
mod rawg;
mod pokeapi;
mod open_meteo;

pub use commands::search;
pub use events::handle_search_play;
pub use pick::choose_or_first;

pub(crate) fn truncate(s: &str, max: usize) -> String {
    if s.len() > max && max > 3 {
        format!("{}...", &s[..max - 3])
    } else {
        s.to_string()
    }
}
