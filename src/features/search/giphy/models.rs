use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GiphyResponse {
    pub data: Vec<GiphyGif>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GiphyGif {
    pub id: String,
    pub title: Option<String>,
    pub url: String,
    pub images: GiphyImages,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GiphyImages {
    pub original: GiphyImageDetails,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GiphyImageDetails {
    pub url: String,
}
