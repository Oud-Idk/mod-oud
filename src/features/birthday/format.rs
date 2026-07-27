/// Formats integers to ordinal strings (e.g. 21 -> "21st", 22 -> "22nd", 11 -> "11th")
pub fn format_ordinal(n: i32) -> String {
    let suffix = match (n % 10, n % 100) {
        (1, 11) => "th",
        (1, _) => "st",
        (2, 12) => "th",
        (2, _) => "nd",
        (3, 13) => "th",
        (3, _) => "rd",
        _ => "th",
    };
    format!("{}{}", n, suffix)
}

/// Joins a vector into a natural list: ["A"] -> "A", ["A", "B"] -> "A and B", ["A", "B", "C"] -> "A, B, and C"
pub fn format_natural_list(items: &[String]) -> String {
    match items.len() {
        0 => String::new(),
        1 => items[0].clone(),
        2 => format!("{} and {}", items[0], items[1]),
        _ => {
            let (last, rest) = items.split_last().unwrap();
            format!("{}, and {}", rest.join(", "), last)
        }
    }
}