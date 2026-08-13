import fs from 'node:fs/promises'; // Use promises-based fs for async operations
import path from 'node:path';
import yaml from 'js-yaml';

// Type definitions for clarity
type LinguistLanguageDetails = {
    extensions?: string[];
};
type LinguistData = Record<string, LinguistLanguageDetails>;

const LINGUIST_URL = 'https://raw.githubusercontent.com/github/linguist/master/lib/linguist/languages.yml';

console.log('Starting language map generation...');

try {
    // 1. Fetch the YAML file from the remote URL
    console.log(`Fetching data from ${LINGUIST_URL}...`);
    const res = await fetch(LINGUIST_URL);
    if (!res.ok) {
        throw new Error(`HTTP error! Status: ${res.status}`);
    }
    const yamlText = await res.text();

    // 2. Parse the YAML data
    const linguistData = yaml.load(yamlText) as LinguistData;

    // 3. Build the simplified extension-to-language map
    const extensionMap: Record<string, string> = {};
    for (const [languageName, details] of Object.entries(linguistData)) {
        if (details.extensions && Array.isArray(details.extensions)) {
            for (const ext of details.extensions) {
                const cleanExt = ext.substring(1).toLowerCase();
                if (!extensionMap[cleanExt]) {
                    extensionMap[cleanExt] = languageName;
                }
            }
        }
    }

    // 4. Write the optimized JSON file to the data directory
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