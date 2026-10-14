import { describe, expect, it } from "vitest";
import { getEventChord, normalizeChord, type KeyChordEvent } from "./useKeySequence";

function keyEvent(overrides: Partial<KeyChordEvent> = {}): KeyChordEvent {
    return {
        key: "a",
        code: "KeyA",
        ctrlKey: false,
        altKey: false,
        shiftKey: false,
        metaKey: false,
        ...overrides,
    };
}

describe("normalizeChord", () => {
    it("orders modifiers canonically regardless of input order", () => {
        expect(normalizeChord("shift+ctrl+k")).toBe("ctrl+shift+k");
        expect(normalizeChord("meta+shift+alt+ctrl+x")).toBe("ctrl+alt+shift+meta+x");
    });

    it("lowercases the whole chord", () => {
        expect(normalizeChord("CTRL+K")).toBe("ctrl+k");
        expect(normalizeChord("Alt+F4")).toBe("alt+f4");
    });

    it("unifies modifier aliases", () => {
        expect(normalizeChord("control+x")).toBe("ctrl+x");
        expect(normalizeChord("cmd+s")).toBe("meta+s");
        expect(normalizeChord("command+s")).toBe("meta+s");
    });

    it("trims whitespace around pieces", () => {
        expect(normalizeChord(" ctrl + k ")).toBe("ctrl+k");
    });

    it("passes a bare key through", () => {
        expect(normalizeChord("a")).toBe("a");
    });
});

describe("getEventChord", () => {
    it.each(["Control", "Alt", "Shift", "Meta"])("ignores a bare %s press", (key) => {
        expect(getEventChord(keyEvent({ key, code: `${key}Left` }))).toBeNull();
    });

    it("maps a plain key press", () => {
        expect(getEventChord(keyEvent({ key: "a", code: "KeyA" }))).toBe("a");
    });

    it("prefixes held modifiers in canonical order", () => {
        expect(
            getEventChord(keyEvent({ key: "K", code: "KeyK", ctrlKey: true, shiftKey: true }))
        ).toBe("ctrl+shift+k");
    });

    it("reads digits from the code, not the shifted character", () => {
        expect(getEventChord(keyEvent({ key: "&", code: "Digit7", shiftKey: true }))).toBe(
            "shift+7"
        );
    });

    it("maps the meta modifier", () => {
        expect(getEventChord(keyEvent({ key: "s", code: "KeyS", metaKey: true }))).toBe("meta+s");
    });
});
