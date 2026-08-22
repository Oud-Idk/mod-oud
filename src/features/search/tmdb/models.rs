use serde::{Deserialize, Serialize};

#[derive(Debug, poise::ChoiceParameter, Clone, Copy, PartialEq, Eq)]
pub enum TmdbMediaType {
    #[name = "Movie"]
    Movie,
    #[name = "TV Show"]
    Tv,
}

impl TmdbMediaType {
    pub const fn as_endpoint_path(self) -> &'static str {
        match self {
            Self::Movie => "movie",
            Self::Tv => "tv",
        }
    }

    pub const fn name(self) -> &'static str {
        match self {
            Self::Movie => "Movie",
            Self::Tv => "TV Show",
        }
    }
}

// --- Search ---
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmdbSearchResponse {
    pub page: u32,
    #[serde(default)]
    pub results: Vec<TmdbSearchResult>,
    pub total_pages: u32,
    pub total_results: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmdbSearchResult {
    pub id: u64,
    // Movies use "title", TV shows use "name" - alias covers both.
    #[serde(alias = "name")]
    pub title: Option<String>,
    // Movies use "release_date", TV shows use "first_air_date".
    #[serde(alias = "first_air_date")]
    pub release_date: Option<String>,
    pub overview: Option<String>,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub vote_average: Option<f32>,
    pub vote_count: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmdbMovieDetail {
    pub id: u64,
    pub title: String,
    pub tagline: Option<String>,
    pub overview: Option<String>,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub release_date: Option<String>,
    pub runtime: Option<u32>,
    pub status: Option<String>,
    pub vote_average: Option<f32>,
    pub vote_count: Option<u32>,
    pub homepage: Option<String>,
    #[serde(default)]
    pub genres: Vec<TmdbGenre>,
    pub budget: Option<u64>,
    pub revenue: Option<u64>,
    pub credits: Option<TmdbCredits>,
    pub videos: Option<TmdbVideosResponse>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmdbTvDetail {
    pub id: u64,
    pub name: String,
    pub tagline: Option<String>,
    pub overview: Option<String>,
    pub poster_path: Option<String>,
    pub backdrop_path: Option<String>,
    pub first_air_date: Option<String>,
    pub last_air_date: Option<String>,
    pub number_of_seasons: Option<u32>,
    pub number_of_episodes: Option<u32>,
    pub status: Option<String>,
    pub vote_average: Option<f32>,
    pub vote_count: Option<u32>,
    pub homepage: Option<String>,
    #[serde(default)]
    pub genres: Vec<TmdbGenre>,
    #[serde(default)]
    pub created_by: Vec<TmdbCreator>,
    pub credits: Option<TmdbCredits>,
    pub videos: Option<TmdbVideosResponse>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmdbCreator {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmdbCredits {
    #[serde(default)]
    pub cast: Vec<TmdbCastMember>,
    #[serde(default)]
    pub crew: Vec<TmdbCrewMember>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmdbCastMember {
    pub name: String,
    pub character: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmdbCrewMember {
    pub name: String,
    pub job: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmdbVideosResponse {
    #[serde(default)]
    pub results: Vec<TmdbVideo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmdbVideo {
    pub site: String,
    pub key: String,
    #[serde(rename = "type")]
    pub video_type: String,
    pub official: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TmdbGenre {
    pub id: u32,
    pub name: String,
}

/// Unified handle so the command doesn't need to match on media type
/// every time it wants to render something.
#[derive(Debug, Clone)]
pub enum TmdbDetail {
    Movie(TmdbMovieDetail),
    Tv(TmdbTvDetail),
}

const IMAGE_BASE_URL: &str = "https://image.tmdb.org/t/p/w500";
const TMDB_WEB_BASE_URL: &str = "https://www.themoviedb.org";

impl TmdbDetail {
    pub fn title(&self) -> &str {
        match self {
            Self::Movie(m) => &m.title,
            Self::Tv(t) => &t.name,
        }
    }

    pub fn tagline(&self) -> Option<&str> {
        match self {
            Self::Movie(m) => m.tagline.as_deref(),
            Self::Tv(t) => t.tagline.as_deref(),
        }
            .filter(|t| !t.trim().is_empty())
    }

    pub fn overview(&self) -> Option<&str> {
        match self {
            Self::Movie(m) => m.overview.as_deref(),
            Self::Tv(t) => t.overview.as_deref(),
        }
    }

    pub fn poster_url(&self) -> Option<String> {
        let path = match self {
            Self::Movie(m) => m.poster_path.as_deref(),
            Self::Tv(t) => t.poster_path.as_deref(),
        }?;
        Some(format!("{IMAGE_BASE_URL}{path}"))
    }

    pub fn release_info(&self) -> Option<String> {
        match self {
            Self::Movie(m) => m.release_date.clone(),
            Self::Tv(t) => match (&t.first_air_date, &t.last_air_date) {
                (Some(start), Some(end)) if start != end => {
                    Some(format!("{start} – {end}"))
                }
                (Some(start), _) => Some(start.clone()),
                _ => None,
            },
        }
    }

    pub fn runtime_display(&self) -> Option<String> {
        match self {
            Self::Movie(m) => m.runtime.filter(|r| *r > 0).map(|r| format!("{r} min")),
            Self::Tv(t) => t.number_of_seasons.map(|s| {
                let eps = t.number_of_episodes.unwrap_or(0);
                format!("{s} season(s), {eps} episodes")
            }),
        }
    }

    pub fn genres(&self) -> String {
        let genres = match self {
            Self::Movie(m) => &m.genres,
            Self::Tv(t) => &t.genres,
        };
        if genres.is_empty() {
            "Unknown".to_string()
        } else {
            genres.iter().map(|g| g.name.as_str()).collect::<Vec<_>>().join(", ")
        }
    }

    pub const fn vote_average(&self) -> Option<f32> {
        match self {
            Self::Movie(m) => m.vote_average,
            Self::Tv(t) => t.vote_average,
        }
    }

    pub fn status(&self) -> Option<&str> {
        match self {
            Self::Movie(m) => m.status.as_deref(),
            Self::Tv(t) => t.status.as_deref(),
        }
    }

    pub fn web_url(media_type: TmdbMediaType, id: u64) -> String {
        format!("{TMDB_WEB_BASE_URL}/{}/{}", media_type.as_endpoint_path(), id)
    }

    pub fn top_cast(&self, limit: usize) -> Option<String> {
        let cast = match self {
            Self::Movie(m) => m.credits.as_ref()?.cast.as_slice(),
            Self::Tv(t) => t.credits.as_ref()?.cast.as_slice(),
        };

        if cast.is_empty() {
            return None;
        }

        let names: Vec<&str> = cast.iter().take(limit).map(|c| c.name.as_str()).collect();
        Some(names.join(", "))
    }

    // Director (Movie) or Creators (TV)
    pub fn directors_or_creators(&self) -> Option<String> {
        match self {
            Self::Movie(m) => {
                let crew = &m.credits.as_ref()?.crew;
                let directors: Vec<&str> = crew
                    .iter()
                    .filter(|c| c.job.eq_ignore_ascii_case("Director"))
                    .map(|c| c.name.as_str())
                    .collect();
                if directors.is_empty() { None } else { Some(directors.join(", ")) }
            }
            Self::Tv(t) => {
                if t.created_by.is_empty() {
                    None
                } else {
                    Some(t.created_by.iter().map(|c| c.name.as_str()).collect::<Vec<_>>().join(", "))
                }
            }
        }
    }

    // First official YouTube Trailer link
    pub fn trailer_url(&self) -> Option<String> {
        let videos = match self {
            Self::Movie(m) => &m.videos.as_ref()?.results,
            Self::Tv(t) => &t.videos.as_ref()?.results,
        };

        let trailer = videos
            .iter()
            .find(|v| v.site == "YouTube" && v.video_type == "Trailer" && v.official.unwrap_or(false))
            .or_else(|| videos.iter().find(|v| v.site == "YouTube" && v.video_type == "Trailer"))?;

        Some(format!("https://www.youtube.com/watch?v={}", trailer.key))
    }

    pub fn rating_display(&self) -> Option<String> {
        let avg = self.vote_average()?;
        let count = match self {
            Self::Movie(m) => m.vote_count.unwrap_or(0),
            Self::Tv(t) => t.vote_count.unwrap_or(0),
        };
        Some(format!("{avg:.1} / 10 ({count} votes)"))
    }
}