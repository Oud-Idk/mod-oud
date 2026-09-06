use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct WikiSummary {
    pub title: String,
    pub description: Option<String>,
    pub extract: String,
    pub content_urls: ContentUrls,
    pub thumbnail: Option<WikiImage>,
}

#[derive(Debug, Deserialize)]
pub struct WikiImage {
    pub source: String,
}

#[derive(Debug, Deserialize)]
pub struct PageUrl {
    pub page: String,
}

#[derive(Debug, Deserialize)]
pub struct ContentUrls {
    pub desktop: PageUrl,
}

#[derive(Debug, Deserialize)]
pub struct SearchResult {
    pub pages: Vec<SearchPage>,
}

#[derive(Debug, Deserialize)]
pub struct SearchPage {
    pub id: u64,
    pub key: String,
    pub title: String,
}