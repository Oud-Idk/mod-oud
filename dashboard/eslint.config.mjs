import {defineConfig, globalIgnores} from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([...nextVitals, ...nextTs, // Override default ignores of eslint-config-next.
    globalIgnores([// Default ignores of eslint-config-next:
        ".next/**", "out/**", "build/**", "next-env.d.ts"]),

    {
        rules: {
            "@typescript-eslint/consistent-type-assertions": ["error", {
                "assertionStyle": "never",
            }], "@typescript-eslint/no-explicit-any": ["error", {
                "fixToUnknown": false,
            }],
        },
    }]);

export default eslintConfig;