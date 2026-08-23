use rand::seq::IndexedRandom;

/// Pick a random item from `items` if `is_random` and the list is non-empty,
/// otherwise take the first item. Returns `None` only when the list is empty.
pub fn choose_or_first<T: Clone>(items: Vec<T>, is_random: bool) -> Option<T> {
    if is_random && !items.is_empty() {
        items.choose(&mut rand::rng()).cloned()
    } else {
        items.into_iter().next()
    }
}
