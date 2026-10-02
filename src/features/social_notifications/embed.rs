//! Turning feed markup into something Discord can actually render.

use scraper::{ElementRef, Html, Node};
use serenity::all::CreateEmbed;

use crate::constants::BRAND_COLOR;

/// Longest description we put in an embed.
///
/// Discord's own limit is far higher, but a wall of text in a feed
/// notification helps nobody.
const MAX_DESCRIPTION_CHARS: usize = 250;

/// Builds the Discord embed for one feed entry.
///
/// Shared by the poller and the `WebSub` callback so both delivery paths render
/// a new post identically.
pub fn build_entry_embed(entry: &feed_rs::model::Entry) -> CreateEmbed {
    let title = entry.title.as_ref().map_or("New Post", |t| &t.content);
    let link = entry.links.first().map_or("", |l| &l.href);
    let description = description_from_markup(entry.summary.as_ref().map_or("", |s| &s.content));

    let mut embed = CreateEmbed::new().title(title).url(link).color(BRAND_COLOR);

    // Discord rejects an embed whose description is an empty string, so only set
    // the field when the feed actually gave us something to say.
    if !description.is_empty() {
        embed = embed.description(description);
    }

    embed
}

/// Flattens a feed's summary into plain text for an embed description.
///
/// Feeds routinely ship markup — hnrss sends `<p>` and `<a>` blocks — and
/// Discord renders markdown rather than HTML, so passing it through raw shows
/// the reader literal `<p>` and `<a href=…>` tags instead of the text.
pub fn description_from_markup(markup: &str) -> String {
    let document = Html::parse_document(markup);

    let mut text = String::new();
    collect_text(document.root_element(), &mut text);

    // Tags and CDATA newlines leave runs of whitespace behind once flattened.
    let flattened = text.split_whitespace().collect::<Vec<_>>().join(" ");

    truncate(&flattened)
}

/// Collects text nodes in document order, marking every boundary so adjacent
/// tags like `</a><p>` do not glue two words into one.
fn collect_text(element: ElementRef<'_>, out: &mut String) {
    for child in element.children() {
        match child.value() {
            Node::Text(text) => {
                out.push_str(text);
                out.push(' ');
            }
            Node::Element(node) => {
                if node.name() == "br" {
                    out.push(' ');
                    continue;
                }

                if let Some(child) = ElementRef::wrap(child) {
                    collect_text(child, out);
                }
            }
            _ => {}
        }
    }
}

/// Trims to the embed budget on a word boundary, marking that text was cut.
fn truncate(text: &str) -> String {
    if text.chars().count() <= MAX_DESCRIPTION_CHARS {
        return text.to_string();
    }

    // Reserve a character for the ellipsis so the result still fits the budget.
    let kept: String = text.chars().take(MAX_DESCRIPTION_CHARS - 1).collect();
    let head = kept
        .rsplit_once(' ')
        .map_or(kept.as_str(), |(head, _)| head);

    format!("{head}…")
}

#[cfg(test)]
mod tests {
    use super::{MAX_DESCRIPTION_CHARS, description_from_markup};

    /// The exact shape hnrss ships, which reached Discord as literal tags.
    const HN_ITEM: &str = "<p>Article URL: <a href=\"https://blog.example.com/post.html\">https://blog.example.com/post.html</a></p>\n<p>Comments URL: <a href=\"https://news.ycombinator.com/item?id=1\">https://news.ycombinator.com/item?id=1</a></p>\n<p>Points: 15</p>";

    #[test]
    fn strips_markup_but_keeps_the_text() {
        let text = description_from_markup(HN_ITEM);

        assert!(!text.contains('<'), "left a tag in {text:?}");
        assert!(text.contains("Article URL: https://blog.example.com/post.html"));
        assert!(text.contains("Points: 15"));
    }

    #[test]
    fn separates_words_split_across_tags() {
        assert_eq!(
            description_from_markup("<b>Bold</b><i>Italic</i>"),
            "Bold Italic"
        );
    }

    #[test]
    fn decodes_entities() {
        assert_eq!(
            description_from_markup("<p>Tom &amp; Jerry &lt;3</p>"),
            "Tom & Jerry <3"
        );
    }

    #[test]
    fn collapses_cdata_whitespace() {
        assert_eq!(
            description_from_markup("\n  <p>One</p>\n\n  <p>Two</p>\n "),
            "One Two"
        );
    }

    #[test]
    fn leaves_plain_text_untouched() {
        assert_eq!(
            description_from_markup("Just a sentence."),
            "Just a sentence."
        );
    }

    #[test]
    fn returns_empty_for_empty_input() {
        assert_eq!(description_from_markup(""), "");
        assert_eq!(description_from_markup("<p></p>"), "");
    }

    #[test]
    fn truncates_on_a_word_boundary_within_budget() {
        let long = "word ".repeat(200);
        let text = description_from_markup(&long);

        assert!(text.chars().count() <= MAX_DESCRIPTION_CHARS);
        assert!(text.ends_with('…'));
        // No dangling partial word before the ellipsis.
        assert!(text.ends_with("word…"), "cut mid-word: {text:?}");
    }
}
