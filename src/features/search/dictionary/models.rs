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
    pub forms: Vec<Form>,
    #[serde(default)]
    pub senses: Vec<Sense>,
    #[serde(default)]
    pub synonyms: Vec<String>,
    #[serde(default)]
    pub antonyms: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Language {
    pub code: String,
    pub name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Pronunciation {
    #[serde(rename = "type")]
    pub kind: String,
    pub text: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Form {
    pub word: String,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Sense {
    pub definition: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub examples: Vec<String>,
    #[serde(default)]
    pub quotes: Vec<Quote>,
    #[serde(default)]
    pub synonyms: Vec<String>,
    #[serde(default)]
    pub antonyms: Vec<String>,
    #[serde(default)]
    pub translations: Vec<Translation>,
    /// Recursive reference to self for sub-definitions:
    #[serde(default)]
    pub subsenses: Vec<Sense>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Quote {
    pub text: String,
    #[serde(default)]
    pub reference: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Translation {
    pub language: Language,
    pub word: String,
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
    pub url: String,
}

impl DictionaryAPIResponse {
    /// Grabs the first English definition, or falls back to any language available.
    pub fn primary_definition(&self) -> Option<&str> {
        self.entries
            .iter()
            .find(|e| e.language.code == "en")
            .or_else(|| self.entries.first())
            .and_then(|e| e.senses.first())
            .map(|s| s.definition.as_str())
    }

    /// Grabs the primary pronunciation IPA if available
    pub fn ipa(&self) -> Option<&str> {
        self.entries
            .iter()
            .flat_map(|e| &e.pronunciations)
            .find(|p| p.kind == "ipa")
            .map(|p| p.text.as_str())
    }
}
