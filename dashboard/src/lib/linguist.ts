import extensionMap from '@/data/language-map.json';

const map: Record<string, string> = extensionMap;

export function getLinguist(key: string): string | undefined {
    if (key.trim() === "") return undefined;
    return map[key.toLowerCase()];
}