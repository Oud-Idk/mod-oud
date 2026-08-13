import extensionMap from '@/data/language-map.json';

const map = extensionMap as Record<string, string>;

export class Linguist {
    /**
     * Synchronously gets the language name from a file extension.
     */
    public static get(key: string): string | undefined {
        if (!key) return undefined;
        return map[key.toLowerCase()];
    }
}