import fs from 'node:fs/promises';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { z } from 'zod';

const linguistLanguageDetailsSchema = z.object({
    extensions: z.string().array().optional(),
    aliases: z.string().array().optional(),
})
const linguistDataSchema = z.record(z.string(), linguistLanguageDetailsSchema)
const LINGUIST_URL = 'https://raw.githubusercontent.com/github/linguist/master/lib/linguist/languages.yml';

console.log('Starting language map generation...');

try {
    // Fetch the YAML file from the remote URL
    console.log(`Fetching data from ${LINGUIST_URL}...`);
    const res = await fetch(LINGUIST_URL);
    if (!res.ok) {
        throw new Error(`HTTP error! Status: ${res.status.toString()}`);
    }
    const yamlText = await res.text();

    // Parse the YAML data
    const linguistData = linguistDataSchema.parse(yaml.load(yamlText));

    // `names` is authoritative: a language's own name plus its aliases.
    // This is the key space callers actually hold (the ```rust fence label).
    const names: Record<string, string> = {};

    for (const [languageName, details] of Object.entries(linguistData)) {
        names[languageName.toLowerCase()] = languageName;
        for (const alias of details.aliases ?? []) {
            names[alias.toLowerCase()] = languageName;
        }
    }

    // `extensions` maps file extensions -> language. Many extensions are
    // claimed by several languages (.rs by RenderScript, Rust and XML), so we
    // resolve them in two passes:
    //   1. self-claims win - the extension equals the language's name or an
    //      alias of it (.rs -> Rust, .ts -> TypeScript, .sql -> SQL)
    //   2. everything else is first-claim-wins, so the result is deterministic
    const extensions: Record<string, string> = {};
    const claimed = new Set<string>();

    const ownIdentifiers = (languageName: string, details: { aliases?: string[] }): Set<string> =>
        new Set([languageName.toLowerCase(), ...(details.aliases ?? []).map((a) => a.toLowerCase())]);

    for (const [languageName, details] of Object.entries(linguistData)) {
        const own = ownIdentifiers(languageName, details);
        for (const ext of details.extensions ?? []) {
            const cleanExt = ext.substring(1).toLowerCase();
            if (own.has(cleanExt)) {
                extensions[cleanExt] = languageName;
                claimed.add(cleanExt);
            }
        }
    }

    for (const [languageName, details] of Object.entries(linguistData)) {
        for (const ext of details.extensions ?? []) {
            const cleanExt = ext.substring(1).toLowerCase();
            if (!claimed.has(cleanExt)) {
                extensions[cleanExt] = languageName;
                claimed.add(cleanExt);
            }
        }
    }

    // Write the optimized JSON file to the data directory
    const outputDir = path.join(process.cwd(), 'src/data');
    const outputFilePath = path.join(outputDir, 'language-map.json');

    // Ensure the directory exists
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(outputFilePath, JSON.stringify({ extensions, names }, null, 2));

    console.log(`  names:      ${String(Object.keys(names).length)}`);
    console.log(`  extensions: ${String(Object.keys(extensions).length)}`);
    console.log(`Successfully generated language map at ${outputFilePath}`);

} catch (error) {
    console.error('Failed to generate language map:', error);
    process.exit(1);
}