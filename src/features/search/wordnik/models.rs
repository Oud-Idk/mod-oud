use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordnikDefinition {
    pub word: Option<String>,
    pub text: Option<String>,
    pub part_of_speech: Option<String>,
    pub source_dictionary: Option<String>,
    pub attribution_text: Option<String>,
    pub sequence: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WordOfTheDayExample {
    pub id: Option<i64>,
    pub title: Option<String>,
    pub text: Option<String>,
    pub url: Option<String>,
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