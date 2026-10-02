import languageMap from '@/data/language-map.json';

// The JSON is inferred as an object literal with no index signature, so the
// Record annotations are required to index it with a runtime string.
const { names, extensions }: {
    names: Record<string, string>;
    extensions: Record<string, string>;
} = languageMap;

export function getLinguist(key: string): string | undefined {
    const normalized = key.trim().toLowerCase();
    if (normalized === "") return undefined;
    // `names` first: the key we hold from a ```rust fence is a language name or
    // alias, not a file extension. `extensions` is the fallback for callers
    // that have an actual file extension.
    return names[normalized] ?? extensions[normalized];
}