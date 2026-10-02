import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { visit } from "unist-util-visit";
import { headingRank } from "hast-util-heading-rank";
import { toString } from "hast-util-to-string";
import type { Element, Root } from "hast";
import type { PluggableList } from "unified";

import rehypeRaw from "rehype-raw";
import rehypeSlug from "rehype-slug";
import rehypeKatex from "rehype-katex";

import { remarkPlugins, remarkRehypeOptions } from "./markdown-plugins";

export interface TocItem {
    id: string;
    text: string;
    level: number;
}

/** Deepest heading level the ToC lists. */
const MAX_LEVEL = 4;

// Drops autolink-headings and external-links: they only wrap headings in anchors
// and add link attributes. Katex must stay — it rewrites math heading text, so
// removing it would change the ids rehype-slug mints and break the ToC links.
const tocRehypePlugins: PluggableList = [rehypeRaw, rehypeKatex, rehypeSlug];

const processor = unified()
    .use(remarkParse)
    .use(remarkPlugins)
    .use(remarkRehype, remarkRehypeOptions)
    .use(tocRehypePlugins);

/** Outlines keyed by the exact markdown they came from. */
const cache = new Map<string, TocItem[]>();

/** Bounded so a long-running process can't grow this without limit. */
const CACHE_LIMIT = 64;

/**
 * Pull the heading outline so the ToC renders server-side.
 * Memoized: a new array identity makes `TableOfContents` re-run its scroll-spy.
 */
export function extractToc(markdown?: string): TocItem[] {
    if (markdown === undefined || markdown === "") {
        return [];
    }

    const cached = cache.get(markdown);
    if (cached) {
        return cached;
    }

    const tree: Root = processor.runSync(processor.parse(markdown));
    const items: TocItem[] = [];

    visit(tree, "element", (node: Element) => {
        const level = headingRank(node);
        if (level == null || level > MAX_LEVEL) {
            return;
        }

        // `rehype-slug` only fills in missing ids, so a heading written as raw
        // HTML keeps its own — read it rather than re-slugging the text.
        const id = node.properties.id;
        if (typeof id !== "string" || id.trim() === "") {
            return;
        }

        const text = toString(node);
        if (text.trim() === "") {
            return;
        }

        items.push({ id, text, level });
    });

    // Evict oldest rather than clear: pages share documents.
    if (cache.size >= CACHE_LIMIT) {
        const oldest = cache.keys().next();
        if (!oldest.done) {
            cache.delete(oldest.value);
        }
    }
    cache.set(markdown, items);

    return items;
}
