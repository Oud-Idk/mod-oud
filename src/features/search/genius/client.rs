use std::sync::LazyLock;
use scraper::{ElementRef, Html, Node, Selector};
use crate::features::search::genius::models::{DomChild, GeniusSongLookupResult, GeniusSongSearchResponse, Hit, Song};

#[derive(Clone)]
struct RawFetched {
    song: Song,
    raw_html: String,
}

#[derive(Clone)]
struct SimpleSongDetail<'a> {
    title: &'a str,
    description: Option<String>,
    lyrics: String,
}

#[derive(Clone)]
pub struct GeniusClient {
    api_key: String,
    http: reqwest::Client,
    base_url: &'static str,
    base_frontend_url: &'static str,
}

static LYRICS_SELECTOR: LazyLock<Selector> = LazyLock::new(|| {
    Selector::parse(r#"div[data-lyrics-container="true"]"#).unwrap()
});

impl GeniusClient {
    pub fn new(api_key: impl Into<String>, http: reqwest::Client) -> Self {
        Self { api_key: api_key.into(), http, base_url: "https://api.genius.com", base_frontend_url: "https://genius.com" }
    }

    async fn search_songs(&self, query: &str) -> Result<GeniusSongSearchResponse, reqwest::Error> {
        let response = self
            .http
            .get(format!("{}/search", self.base_url))
            .bearer_auth(&self.api_key)
            .query(&[("q", query)])
            .send()
            .await?
            .error_for_status()?
            .json::<GeniusSongSearchResponse>()
            .await?;

        Ok(response)
    }

    async fn search_song_by_api_path(&self, api_path: &str) -> Result<GeniusSongLookupResult, reqwest::Error> {
        let response = self
            .http
            .get(format!("{}{api_path}", self.base_url))
            .bearer_auth(&self.api_key)
            .send()
            .await?
            .error_for_status()?
            .json::<GeniusSongLookupResult>()
            .await?;

        Ok(response)
    }

    async fn search_song_by_result(&self, hit: &Hit) -> Result<GeniusSongLookupResult, reqwest::Error> {
        let response = self
            .search_song_by_api_path(hit.result.api_path.as_str())
            .await?;

        Ok(response)
    }

    async fn lookup_main_site_for_lyrics(&self, song: &Song) -> Result<String, reqwest::Error> {
        let response = self
            .http
            .get(format!("{}{}", self.base_frontend_url, song.path))
            .send()
            .await?
            .error_for_status()?
            .text()
            .await?;

        Ok(response)
    }

    fn extract_text(element: ElementRef<'_>, output: &mut String) {
        for child in element.children() {
            match child.value() {
                Node::Text(text) => {
                    output.push_str(text);
                }
                Node::Element(el) => {
                    let Some(child_ref) = ElementRef::wrap(child) else {
                        continue;
                    };

                    if el.attr("data-exclude-from-selection") == Some("true") {
                        continue;
                    }

                    if el.name() == "br" {
                        if !output.ends_with('\n') {
                            output.push('\n');
                        }
                        continue;
                    }

                    Self::extract_text(child_ref, output);
                }
                _ => {}
            }
        }
    }

    fn scrape_lyrics(raw_html: &str) -> String {
        let document = Html::parse_document(raw_html);

        let mut lyrics_text = String::new();

        for container in document.select(&LYRICS_SELECTOR) {
            let mut container_text = String::new();
            Self::extract_text(container, &mut container_text);
            if container_text.is_empty() {
                continue;
            }
            lyrics_text.push_str(container_text.trim());
            lyrics_text.push('\n');
        }

        lyrics_text.trim().to_string()
    }

    fn format_lyrics(lyrics: &str) -> String {
        let mut formatted = String::with_capacity(lyrics.len() + 128);

        let mut lines = lyrics.lines();

        if let Some(first_line) = lines.next() {
            if first_line.starts_with('[') && first_line.ends_with(']') {
                formatted.push_str("### ");
            }
            formatted.push_str(first_line);

            for line in lines {
                formatted.push('\n');
                if line.starts_with('[') && line.ends_with(']') {
                    formatted.push_str("### ");
                }
                formatted.push_str(line);
            }
        }

        formatted
    }

    fn parse_description_dom(node: &DomChild) -> String {
        match node {
            DomChild::Text(text) => text.clone(),
            DomChild::Node(dom_node) => dom_node
                .children
                .iter()
                .map(Self::parse_description_dom)
                .collect(),
        }
    }

    fn extract_description(song: &Song) -> Option<String> {
        let description_dom = &song.description.dom;
        let text = description_dom
            .children
            .iter()
            .map(Self::parse_description_dom)
            .collect::<String>()
            .trim()
            .to_string();

        (!text.is_empty() && text != "?").then_some(text)
    }


    fn format_for_discord(simple_song_detail: &SimpleSongDetail) -> String {
        let title_len = simple_song_detail.title.len();
        let desc_len = simple_song_detail.description.as_deref().map_or(0, str::len);

        let capacity = title_len + desc_len + simple_song_detail.lyrics.len() + 128;
        let mut final_output = String::with_capacity(capacity);

        final_output.push_str("# ");
        final_output.push_str(simple_song_detail.title);
        final_output.push('\n');

        if let Some(desc) = simple_song_detail.description.as_deref() {
            final_output.push_str("## Description\n");
            final_output.push_str(desc);
            final_output.push('\n');
        }

        final_output.push_str("## Lyrics\n");

        let formatted_lyrics = Self::format_lyrics(&simple_song_detail.lyrics);
        final_output.push_str(formatted_lyrics.trim());

        final_output
    }

    async fn search_song(&self, query: &str) -> Result<Option<Song>, reqwest::Error> {
        let response = self.search_songs(query).await?;

        let Some(first_result) = response.response.hits.first() else {
            return Ok(None);
        };

        let song_result = self.search_song_by_result(first_result).await?;
        Ok(Some(song_result.response.song))
    }

    async fn search_raw_song_by_query(&self, query: &str) -> Result<Option<RawFetched>, reqwest::Error> {
        let Some(song) = self.search_song(query).await? else {
            return Ok(None)
        };
        let raw_html = self.lookup_main_site_for_lyrics(&song).await?;

        Ok(Some(RawFetched {
            song,
            raw_html,
        }))
    }

    fn extract_details(raw_fetched: &RawFetched) -> SimpleSongDetail<'_> {
        let title = raw_fetched.song.title.as_str();
        let description = Self::extract_description(&raw_fetched.song);
        let lyrics = Self::scrape_lyrics(&raw_fetched.raw_html);
        SimpleSongDetail { title, description, lyrics }
    }

    pub async fn search_lyrics_for_discord(&self, query: &str) -> Result<Option<String>, reqwest::Error> {
        let Some(raw) = self.search_raw_song_by_query(query).await? else {
            return Ok(None);
        };

        let result = tokio::task::spawn_blocking(move || {
            let details = Self::extract_details(&raw);
            Self::format_for_discord(&details)
        })
        .await
        .expect("lyrics scrape task panicked");

        Ok(Some(result))
    }
}

