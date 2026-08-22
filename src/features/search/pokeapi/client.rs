use super::models::Pokemon;

#[derive(Clone)]
pub struct PokemonClient {
    http: reqwest::Client,
    base_url: &'static str,
}

impl PokemonClient {
    pub const fn new(http: reqwest::Client) -> Self {
        Self {
            http,
            base_url: "https://pokeapi.co/api/v2",
        }
    }

    /// Fetch a Pokémon by name or Pokédex ID
    pub async fn get_pokemon(&self, name_or_id: &str) -> Result<Pokemon, reqwest::Error> {
        let clean_query = name_or_id.trim().to_lowercase().replace(' ', "-");

        let response = self
            .http
            .get(format!("{}/pokemon/{}", self.base_url, clean_query))
            .send()
            .await?
            .error_for_status()?
            .json::<Pokemon>()
            .await?;

        Ok(response)
    }
}