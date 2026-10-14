// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, renderHook } from "@testing-library/react";
import { useMarkdownScroller } from "./useMarkdownScroller";

function stubRect(element: Element, top: number): void {
    Object.defineProperty(element, "getBoundingClientRect", {
        value: () => ({ top, height: 0, width: 0, x: 0, y: top, left: 0, right: 0, bottom: top }),
        configurable: true,
    });
}

function renderContainer(html: string): HTMLDivElement {
    const { result } = renderHook(() => useMarkdownScroller());
    const { container } = render(
        <div
            ref={result.current.containerRef}
            onClick={result.current.handleLinkClick}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
    const attached = container.firstElementChild;
    if (!(attached instanceof HTMLDivElement)) throw new Error("expected the attached div");
    return attached;
}

function linkIn(container: HTMLDivElement, href: string): HTMLAnchorElement {
    const link = container.querySelector(`a[href="${href}"]`);
    if (!(link instanceof HTMLAnchorElement)) throw new Error(`expected a link to ${href}`);
    return link;
}

describe("useMarkdownScroller", () => {
    it("smooth-scrolls to a same-page hash heading", () => {
        const container = renderContainer(
            '<h2 id="section-1">Title</h2><a href="#section-1">Jump</a>'
        );
        const heading = container.querySelector("#section-1");
        if (heading === null) throw new Error("expected the heading");
        stubRect(container, 100);
        stubRect(heading, 350);
        container.scrollTop = 20;
        const scrollTo = vi.fn<() => void>();
        container.scrollTo = scrollTo;

        const prevented = fireEvent.click(linkIn(container, "#section-1"));

        expect(prevented).toBe(false);
        expect(scrollTo).toHaveBeenCalledWith({ top: 270, behavior: "smooth" });
    });

    it("ignores links to another pathname", () => {
        const container = renderContainer('<a href="/other#section-1">Away</a>');
        const scrollTo = vi.fn<() => void>();
        container.scrollTo = scrollTo;

        const prevented = fireEvent.click(linkIn(container, "/other#section-1"));

        expect(prevented).toBe(true);
        expect(scrollTo).not.toHaveBeenCalled();
    });

    it("ignores clicks that are not on a link", () => {
        const container = renderContainer('<h2 id="section-1">Title</h2>');
        const scrollTo = vi.fn<() => void>();
        container.scrollTo = scrollTo;

        fireEvent.click(container);

        expect(scrollTo).not.toHaveBeenCalled();
    });

    it("decodes percent-encoded hashes before looking up the heading", () => {
        const container = renderContainer(
            '<h2 id="my section">Title</h2><a href="#my%20section">Jump</a>'
        );
        const heading = container.querySelector("#my\\ section");
        if (heading === null) throw new Error("expected the heading");
        stubRect(container, 0);
        stubRect(heading, 120);
        const scrollTo = vi.fn<() => void>();
        container.scrollTo = scrollTo;

        fireEvent.click(linkIn(container, "#my%20section"));

        expect(scrollTo).toHaveBeenCalledWith({ top: 120, behavior: "smooth" });
    });

    it("does nothing when the container is not attached", () => {
        const { result } = renderHook(() => useMarkdownScroller());
        render(
            <div onClick={result.current.handleLinkClick}>
                <a href="#section-1">Jump</a>
            </div>
        );

        const link = document.querySelector('a[href="#section-1"]');
        if (!(link instanceof HTMLAnchorElement)) throw new Error("expected the link");

        expect(() => fireEvent.click(link)).not.toThrow();
    });

    it("does nothing when the heading is missing", () => {
        const container = renderContainer('<a href="#gone">Jump</a>');
        const scrollTo = vi.fn<() => void>();
        container.scrollTo = scrollTo;

        const prevented = fireEvent.click(linkIn(container, "#gone"));

        expect(prevented).toBe(false);
        expect(scrollTo).not.toHaveBeenCalled();
    });
});
