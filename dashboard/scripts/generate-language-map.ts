import fs from 'node:fs/promises';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { z } from 'zod';

const linguistLanguageDetailsSchema = z.object({
    extensions: z.string().array().optional(),
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

    // Build the simplified extension-to-language map
    const extensionMap: Record<string, string> = {};
    for (const [languageName, details] of Object.entries(linguistData)) {
        if (details.extensions && Array.isArray(details.extensions)) {
            for (const ext of details.extensions) {
                const cleanExt = ext.substring(1).toLowerCase();
                if (extensionMap[cleanExt] !== "") {
                    extensionMap[cleanExt] = languageName;
                }
            }
        }
    }

    // Write the optimized JSON file to the data directory
    const outputDir = path.join(process.cwd(), 'src/data');
    const outputFilePath = path.join(outputDir, 'language-map.json');

    // Ensure the directory exists
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(outputFilePath, JSON.stringify(extensionMap, null, 2));

    console.log(`Successfully generated language map at ${outputFilePath}`);

} catch (error) {
    console.error('Failed to generate language map:', error);
    process.exit(1);
}