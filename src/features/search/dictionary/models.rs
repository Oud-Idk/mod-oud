use serde::Deserialize;

// Wordnik
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordnikDefinition {
    pub word: Option<String>,
    pub text: Option<String>,
    pub part_of_speech: Option<String>,
    pub source_dictionary: Option<String>,
    pub attribution_text: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordOfTheDayExample {
    pub title: Option<String>,
    pub text: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordOfTheDay {
    pub word: String,
    pub publish_date: Option<String>,
    pub note: Option<String>,
    pub definitions: Option<Vec<WordnikDefinition>>,
    pub examples: Option<Vec<WordOfTheDayExample>>,
}

// Wiktionary / Free Dictionary API
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum FreeDictionaryResponse {
    Single(DictionaryAPIResponse),
    Multiple(Vec<DictionaryAPIResponse>),
}

impl FreeDictionaryResponse {
    pub fn into_vec(self) -> Vec<DictionaryAPIResponse> {
        match self {
            Self::Single(r) => vec![r],
            Self::Multiple(v) => v,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct DictionaryAPIResponse {
    pub word: String,
    #[serde(default)]
    pub entries: Vec<Entry>,
    #[serde(default)]
    pub source: Option<Source>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Entry {
    pub language: Language,
    #[serde(rename = "partOfSpeech")]
    pub part_of_speech: String,
    #[serde(default)]
    pub pronunciations: Vec<Pronunciation>,
    #[serde(default)]
    pub senses: Vec<Sense>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Language {
    pub code: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Pronunciation {
    #[serde(rename = "type")]
    pub kind: String,
    pub text: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Sense {
    pub definition: String,
    #[serde(default)]
    pub examples: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Source {
    pub url: String,
    #[serde(default)]
    pub license: Option<License>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct License {
    pub name: String,
}