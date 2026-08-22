use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YouTubeSearchResponse {
    #[serde(default)]
    pub items: Vec<YouTubeSearchResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YouTubeSearchResult {
    pub id: YouTubeId,
    pub snippet: YouTubeSnippet,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YouTubeId {
    pub kind: String,
    #[serde(rename = "videoId")]
    pub video_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YouTubeSnippet {
    #[serde(rename = "publishedAt")]
    pub published_at: Option<String>,
    pub title: String,
    pub description: String,
    pub thumbnails: YouTubeThumbnails,
    #[serde(rename = "channelTitle")]
    pub channel_title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YouTubeThumbnails {
    pub high: Option<YouTubeThumbnailItem>,
    pub medium: Option<YouTubeThumbnailItem>,
    pub default: Option<YouTubeThumbnailItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YouTubeThumbnailItem {
    pub url: String,
}

impl YouTubeSearchResult {
    pub fn get_video_url(&self) -> Option<String> {
        self.id
            .video_id
            .as_ref()
            .map(|id| format!("https://www.youtube.com/watch?v={id}"))
    }

    pub fn get_best_thumbnail(&self) -> Option<&str> {
        self.snippet
            .thumbnails
            .high
            .as_ref()
            .or(self.snippet.thumbnails.medium.as_ref())
            .or(self.snippet.thumbnails.default.as_ref())
            .map(|t| t.url.as_str())
    }

    /// Cleans up HTML entities returned by `YouTube` API (like &#39; -> ')
    pub fn clean_title(&self) -> String {
        self.snippet
            .title
            .replace("&quot;", "\"")
            .replace("&#39;", "'")
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
    }
}
