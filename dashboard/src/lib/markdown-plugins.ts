import type { PluggableList } from "unified";

import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import remarkDirective from "remark-directive";

import rehypeRaw from "rehype-raw";
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeExternalLinks from "rehype-external-links";

/**
 * Single source of truth for the markdown pipeline.
 *
 * `MarkdownRenderer` hands these to `react-markdown`; `extractToc` runs a
 * reduced version over the same document. The two must agree on how headings
 * are shaped, or the ToC links point at ids the renderer never emits.
 */
export const remarkPlugins: PluggableList = [remarkGfm, remarkMath, remarkBreaks, remarkDirective];

export const rehypePlugins: PluggableList = [
    rehypeRaw,
    rehypeKatex,
    rehypeSlug,
    [rehypeAutolinkHeadings],
    [rehypeExternalLinks, { target: "_blank", rel: ["noopener", "noreferrer"] }],
];

/** Mirrors the `remarkRehype` options `react-markdown` always applies. */
export const remarkRehypeOptions = { allowDangerousHtml: true } as const;
