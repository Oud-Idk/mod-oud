use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct SpotifySearchResponse {
    pub tracks: Option<SpotifyTracksContainer>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SpotifyTracksContainer {
    #[serde(default)]
    pub items: Vec<SpotifyTrack>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SpotifyTrack {
    pub id: String,
    pub name: String,
    pub external_urls: SpotifyExternalUrls,
    pub artists: Vec<SpotifyArtist>,
    pub album: SpotifyAlbum,
    pub duration_ms: u64,
    pub popularity: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SpotifyArtist {
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SpotifyAlbum {
    pub name: String,
    pub release_date: Option<String>,
    #[serde(default)]
    pub images: Vec<SpotifyImage>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SpotifyImage {
    pub url: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SpotifyExternalUrls {
    pub spotify: String,
}

impl SpotifyTrack {
    pub fn artists_str(&self) -> String {
        self.artists
            .iter()
            .map(|a| a.name.as_str())
            .collect::<Vec<_>>()
            .join(", ")
    }

    pub fn duration_str(&self) -> String {
        let total_seconds = self.duration_ms / 1000;
        let minutes = total_seconds / 60;
        let seconds = total_seconds % 60;
        format!("{minutes}:{seconds:02}")
    }

    pub fn get_best_image(&self) -> Option<&str> {
        self.album.images.first().map(|img| img.url.as_str())
    }
}
