import { describe, expect, it } from "vitest";

import { extractToc } from "@/lib/markdown-toc";

describe("extractToc", () => {
    it("returns an empty outline for empty input", () => {
        expect(extractToc(undefined)).toEqual([]);
        expect(extractToc("")).toEqual([]);
    });

    it("extracts heading ids and text", () => {
        expect(extractToc("## What it is\n\ntext\n\n### Sharding\n\nmore")).toEqual([
            { id: "what-it-is", text: "What it is", level: 2 },
            { id: "sharding", text: "Sharding", level: 3 },
        ]);
    });

    it("caps the outline at level 4", () => {
        const items = extractToc("# a\n## b\n### c\n#### d\n##### e\n###### f");
        expect(items.map((i) => i.level)).toEqual([1, 2, 3, 4]);
    });

    it("keeps the id of a heading written as raw HTML", () => {
        // rehype-slug only fills in missing ids, so a hand-written one survives.
        expect(extractToc('<h2 id="custom">Raw</h2>')).toEqual([
            { id: "custom", text: "Raw", level: 2 },
        ]);
    });

    it("mints the same id for a math heading the renderer will produce", () => {
        // Katex expands the math into markup before rehype-slug mints the id, so
        // dropping katex from this pass would silently break the ToC links. The
        // id and text below are the katex-rewritten ones; without katex this
        // would be `cost-is-e--mc2-ok` and the ToC link would point at nothing.
        expect(extractToc("## Cost is $E = mc^2$ ok")).toEqual([
            { id: "cost-is-emc2e--mc2emc2-ok", text: "Cost is E=mc2E = mc^2E=mc2 ok", level: 2 },
        ]);
    });

    it("returns the same array identity for the same markdown", () => {
        // TableOfContents re-runs its scroll-spy whenever this identity changes.
        const md = "## One\n\n## Two";
        expect(extractToc(md)).toBe(extractToc(md));
    });

    it("bounds the cache", () => {
        // 500 distinct documents against a 64-entry cache. The assertion is on
        // behaviour, not memory: every call must still return the right outline.
        for (const n of Array.from({ length: 500 }, (_, i) => i.toString())) {
            expect(extractToc(`## Heading ${n}\n\ntext`)).toEqual([
                { id: `heading-${n}`, text: `Heading ${n}`, level: 2 },
            ]);
        }
    });
});
