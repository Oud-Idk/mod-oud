use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

// ==========================================
// Top-Level Response Wrappers
// ==========================================

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GeniusResponse<T> {
    pub meta: Meta,
    pub response: T,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Meta {
    pub status: i64,
    pub message: Option<String>,
}

// Search endpoint response wrapper
pub type GeniusSongSearchResponse = GeniusResponse<SearchResponse>;

// Song lookup endpoint response wrapper
pub type GeniusSongLookupResult = GeniusResponse<SongResponse>;

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SearchResponse {
    pub hits: Vec<Hit>,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SongResponse {
    pub song: Song,
}

// ==========================================
// Search Hit & Summary Song
// ==========================================

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Hit {
    #[serde(default)]
    pub highlights: Vec<Value>,
    pub index: String,
    pub matched_words: i64,
    pub nb_exact_words: i64,
    pub nb_typos: i64,
    #[serde(rename = "type")]
    pub result_type: String,
    pub result: SongSummary,
}

/// Used in search results, sampled/covered relationship lists, etc.
#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SongSummary {
    pub id: i64,
    pub api_path: String,
    pub artist_names: String,
    pub full_title: String,
    pub title: String,
    pub title_with_featured: String,
    pub path: String,
    pub url: String,
    pub annotation_count: i64,
    pub lyrics_owner_id: Option<i64>,
    pub lyrics_state: String,
    pub pending_lyrics_edits_count: i64,
    pub primary_artist_names: String,
    pub pyongs_count: Option<i64>,
    pub relationships_index_url: Option<String>,
    pub header_image_thumbnail_url: String,
    pub header_image_url: String,
    #[serde(rename = "song_art_image_thumbnail_url")]
    pub art_image_thumbnail_url: String,
    #[serde(rename = "song_art_image_url")]
    pub art_image_url: String,
    pub release_date_components: Option<ReleaseDateComponents>,
    pub release_date_for_display: Option<String>,
    pub release_date_with_abbreviated_month_for_display: Option<String>,
    pub stats: SongStatsSummary,
    #[serde(default)]
    pub featured_artists: Vec<Artist>,
    pub primary_artist: Artist,
    #[serde(default)]
    pub primary_artists: Vec<Artist>,
}

// ==========================================
// Full Song Details
// ==========================================

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Song {
    pub id: i64,
    pub api_path: String,
    pub apple_music_id: Option<String>,
    pub apple_music_player_url: Option<String>,
    pub artist_names: String,
    pub full_title: String,
    pub title: String,
    pub title_with_featured: String,
    pub path: String,
    pub url: String,
    pub language: Option<String>,
    pub lyrics_owner_id: Option<i64>,
    pub lyrics_state: String,
    pub pending_lyrics_edits_count: i64,
    pub primary_artist_names: String,
    pub pyongs_count: Option<i64>,
    pub recording_location: Option<String>,
    pub relationships_index_url: Option<String>,
    pub release_date: Option<String>,
    pub release_date_for_display: Option<String>,
    pub release_date_with_abbreviated_month_for_display: Option<String>,
    pub embed_content: Option<String>,
    pub header_image_thumbnail_url: String,
    pub header_image_url: String,
    #[serde(rename = "song_art_image_thumbnail_url")]
    pub art_image_thumbnail_url: String,
    #[serde(rename = "song_art_image_url")]
    pub art_image_url: String,
    #[serde(rename = "song_art_primary_color")]
    pub art_primary_color: Option<String>,
    #[serde(rename = "song_art_secondary_color")]
    pub art_secondary_color: Option<String>,
    #[serde(rename = "song_art_text_color")]
    pub art_text_color: Option<String>,
    pub album: Option<Value>,
    #[serde(rename = "song_art_source_album")]
    pub art_source_album: Option<Value>,
    pub stats: FullSongStats,
    pub description: DescriptionContainer,
    pub description_annotation: Option<DescriptionAnnotation>,
    pub current_user_metadata: CurrentUserMetadata,
    #[serde(default)]
    pub custom_performances: Vec<CustomPerformance>,
    #[serde(default)]
    pub featured_artists: Vec<Artist>,
    pub primary_artist: Artist,
    #[serde(default)]
    pub primary_artists: Vec<Artist>,
    #[serde(default)]
    pub producer_artists: Vec<Artist>,
    #[serde(default)]
    pub writer_artists: Vec<Artist>,
    #[serde(default)]
    pub media: Vec<MediaItem>,
    #[serde(default, rename = "song_relationships")]
    pub relationships: Vec<SongRelationship>,
    #[serde(default)]
    pub translation_songs: Vec<Value>,
    pub lyrics_marked_complete_by: Option<User>,
    pub lyrics_marked_staff_approved_by: Option<User>,
}

// ==========================================
// Artist & User
// ==========================================

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Artist {
    pub id: i64,
    pub api_path: String,
    pub name: String,
    pub url: String,
    pub image_url: String,
    pub header_image_url: String,
    #[serde(default)]
    pub is_meme_verified: bool,
    #[serde(default)]
    pub is_verified: bool,
    pub iq: Option<i64>,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct User {
    pub id: i64,
    pub api_path: String,
    pub login: String,
    pub name: String,
    pub role_for_display: Option<String>,
    pub human_readable_role_for_display: Option<String>,
    pub url: String,
    pub header_image_url: Option<String>,
    pub iq: Option<i64>,
    pub avatar: Option<Avatar>,
    pub current_user_metadata: Option<CurrentUserMetadata>,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Avatar {
    pub tiny: Option<ImageSpec>,
    pub thumb: Option<ImageSpec>,
    pub small: Option<ImageSpec>,
    pub medium: Option<ImageSpec>,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ImageSpec {
    pub url: String,
    pub bounding_box: BoundingBox,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BoundingBox {
    pub width: i64,
    pub height: i64,
}

// ==========================================
// Genius Rich Text / DOM Tree
// ==========================================

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DescriptionContainer {
    pub dom: DomNode,
}

/// Recursive DOM element for Genius description/annotation trees.
#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DomNode {
    pub tag: String,
    #[serde(default)]
    pub attributes: HashMap<String, String>,
    #[serde(default)]
    pub data: HashMap<String, Value>,
    #[serde(default)]
    pub children: Vec<DomChild>,
}

/// Nodes can contain plain text or nested DOM nodes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum DomChild {
    Text(String),
    Node(DomNode),
}

// ==========================================
// Annotations & Referents
// ==========================================

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DescriptionAnnotation {
    #[serde(rename = "_type")]
    pub referent_type: Option<String>,
    pub id: i64,
    pub annotator_id: i64,
    pub annotator_login: Option<String>,
    pub api_path: String,
    pub classification: String,
    pub fragment: String,
    pub is_description: bool,
    pub path: String,
    pub url: String,
    pub song_id: Option<i64>,
    #[serde(default)]
    pub annotations: Vec<Annotation>,
}

#[allow(clippy::struct_excessive_bools)] // mirrors the Genius API response shape
#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Annotation {
    pub id: i64,
    pub api_path: String,
    pub body: AnnotationBody,
    pub comment_count: i64,
    pub community: bool,
    pub has_voters: bool,
    pub pinned: bool,
    pub share_url: String,
    pub state: String,
    pub url: String,
    pub verified: bool,
    pub votes_total: i64,
    #[serde(default)]
    pub authors: Vec<Author>,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AnnotationBody {
    pub dom: DomNode,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Author {
    pub attribution: f64,
    pub pinned_role: Option<String>,
    pub user: User,
}

// ==========================================
// Metadata & Stats Helpers
// ==========================================

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SongStatsSummary {
    pub unreviewed_annotations: i64,
    pub hot: bool,
    pub pageviews: Option<i64>,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FullSongStats {
    pub accepted_annotations: Option<i64>,
    pub contributors: Option<i64>,
    pub iq_earners: Option<i64>,
    pub transcribers: Option<i64>,
    pub unreviewed_annotations: Option<i64>,
    pub verified_annotations: Option<i64>,
    pub hot: bool,
    pub pageviews: Option<i64>,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReleaseDateComponents {
    pub year: Option<i64>,
    pub month: Option<i64>,
    pub day: Option<i64>,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CustomPerformance {
    pub label: String,
    #[serde(default)]
    pub artists: Vec<Artist>,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MediaItem {
    pub provider: String,
    pub start: Option<i64>,
    #[serde(rename = "type")]
    pub media_type: String,
    pub url: String,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SongRelationship {
    pub relationship_type: String,
    #[serde(rename = "type")]
    pub type_field: String,
    pub url: Option<String>,
    #[serde(default)]
    pub songs: Vec<SongSummary>,
}

#[derive(Default, Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CurrentUserMetadata {
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default)]
    pub excluded_permissions: Vec<String>,
    #[serde(default)]
    pub interactions: HashMap<String, Value>,
}