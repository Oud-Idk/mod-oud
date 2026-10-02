/**
 * `@types/react-syntax-highlighter` declares every language module as `any` and
 * omits the statics we call on the deep `prism-light` entry point, which leaves
 * oxlint's type-aware rules unable to check `src/components/ui/markdown/prism.ts`.
 * The real shapes are declared here.
 *
 * Deliberately NOT a module: a top-level `import` or `export` would make this
 * file a module, which turns `declare module` into *augmentation* — and
 * augmentation can only add to a module that already exports those names.
 * Hence the inline `import(...)` types.
 *
 * The deep `prism-light` entry point is deliberate; see `prism.ts` for why.
 */

declare module "react-syntax-highlighter/dist/esm/prism-light" {
    const SyntaxHighlighter: import("react").ComponentType<
        import("react-syntax-highlighter").SyntaxHighlighterProps
    > & {
        registerLanguage(name: string, grammar: unknown): void;
        alias(name: string, alias: string | string[]): void;
    };
    export default SyntaxHighlighter;
}

declare module "react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus" {
    const theme: Record<string, import("react").CSSProperties>;
    export default theme;
}

declare module "react-syntax-highlighter/dist/esm/styles/prism/one-light" {
    const theme: Record<string, import("react").CSSProperties>;
    export default theme;
}

/**
 * One grammar definition. `refractor` keys the grammar off `name` and registers
 * `aliases` from the definition itself, which is all `prism.ts` reads.
 */
declare module "react-syntax-highlighter/dist/esm/languages/prism/*" {
    const grammar: { name: string; aliases?: string[] };
    export default grammar;
}
