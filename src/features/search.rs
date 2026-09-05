mod commands;
mod events;
mod genius;
mod giphy;
mod kitsu;
mod klipy;
mod open_meteo;
mod pick;
mod pokeapi;
mod rawg;
mod spotify;
mod tmdb;
mod urban;
mod youtube;
mod wordnik;

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
