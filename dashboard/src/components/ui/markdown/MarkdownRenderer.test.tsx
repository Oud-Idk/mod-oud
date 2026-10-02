import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownRenderer } from "@/components/ui/markdown/MarkdownRenderer";

const tokens = (html: string): string[] =>
    [...html.matchAll(/<span class="token[^"]*"[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);

const render = (content: string): string => renderToStaticMarkup(<MarkdownRenderer content={content} />);

describe("MarkdownRenderer code fences", () => {
    it("highlights a registered language and offers a copy button", () => {
        const html = render("```rust\nfn main() {}\n```");
        // Label comes from the Linguist map, not the fence name.
        expect(html).toContain("Rust");
        expect(html).toContain('aria-label="Copy code"');
        expect(tokens(html).length).toBeGreaterThan(0);
    });

    it("keeps punctuation in the fence name", () => {
        // `\\w+` would truncate this to "c" and label it C.
        expect(render("```c++\nint main(){}\n```")).toContain("C++");
    });

    it("renders an unregistered fence as plain text without throwing", () => {
        const html = render("```totallynotalang\nsome text\n```");
        expect(html).toContain("Plaintext");
        expect(tokens(html)).toHaveLength(0);
    });

    it("tokenizes identically across renders", () => {
        // Regression guard: refractor's registry is a module singleton, so a
        // different grammar set changes token boundaries and breaks hydration.
        const src = "```tsx\nconst r = /a(\\d+)/;\n```";
        expect(tokens(render(src))).toEqual(tokens(render(src)));
        expect(tokens(render(src)).join("")).toContain("a(\\d+)");
    });

    it("uses the light theme on the first render so SSR and hydration agree", () => {
        const html = render("```bash\nls -la\n```");
        expect(html).not.toContain("#d4d4d4"); // vscDarkPlus foreground
        expect(html).toContain("hsl(230, 8%, 24%)"); // oneLight foreground
    });
});
