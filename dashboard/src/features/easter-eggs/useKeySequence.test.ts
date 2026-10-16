// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
    getEventChord,
    normalizeChord,
    useKeySequence,
    type KeyChordEvent,
} from "./useKeySequence";

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

    it("unifies modifier aliases and individual modifiers", () => {
        expect(normalizeChord("ctrl+x")).toBe("ctrl+x");
        expect(normalizeChord("control+x")).toBe("ctrl+x");
        expect(normalizeChord("alt+x")).toBe("alt+x");
        expect(normalizeChord("shift+x")).toBe("shift+x");
        expect(normalizeChord("meta+s")).toBe("meta+s");
        expect(normalizeChord("cmd+s")).toBe("meta+s");
        expect(normalizeChord("command+s")).toBe("meta+s");
    });

    it("trims whitespace around pieces", () => {
        expect(normalizeChord(" ctrl + k ")).toBe("ctrl+k");
    });

    it("passes a bare key through", () => {
        expect(normalizeChord("a")).toBe("a");
    });

    it("handles empty strings gracefully", () => {
        expect(normalizeChord("")).toBe("");
    });
});

describe("getEventChord", () => {
    it.each(["Control", "Alt", "Shift", "Meta"])("ignores a bare %s press", (key: string) => {
        expect(getEventChord(keyEvent({ key, code: `${key}Left` }))).toBeNull();
    });

    it("maps a plain key press and preserves lowercase", () => {
        expect(getEventChord(keyEvent({ key: "A", code: "KeyA" }))).toBe("a");
        expect(getEventChord(keyEvent({ key: "Enter", code: "Enter" }))).toBe("enter");
    });

    it("maps each modifier individually", () => {
        expect(getEventChord(keyEvent({ key: "a", code: "KeyA", ctrlKey: true }))).toBe("ctrl+a");
        expect(getEventChord(keyEvent({ key: "a", code: "KeyA", altKey: true }))).toBe("alt+a");
        expect(getEventChord(keyEvent({ key: "a", code: "KeyA", shiftKey: true }))).toBe("shift+a");
        expect(getEventChord(keyEvent({ key: "a", code: "KeyA", metaKey: true }))).toBe("meta+a");
    });

    it("prefixes held modifiers in canonical order when all are active", () => {
        expect(
            getEventChord(
                keyEvent({
                    key: "z",
                    code: "KeyZ",
                    ctrlKey: true,
                    altKey: true,
                    shiftKey: true,
                    metaKey: true,
                })
            )
        ).toBe("ctrl+alt+shift+meta+z");
    });

    it("reads digits from the code, not the shifted character", () => {
        expect(getEventChord(keyEvent({ key: "&", code: "Digit7", shiftKey: true }))).toBe(
            "shift+7"
        );
        expect(getEventChord(keyEvent({ key: "3", code: "Digit3" }))).toBe("3");
    });
});

describe("useKeySequence", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const fireKey = (init: KeyboardEventInit, target: EventTarget = window): void => {
        const event: KeyboardEvent = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
        target.dispatchEvent(event);
    };

    it("triggers onMatch when the exact sequence is typed", () => {
        const onMatch = vi.fn();
        renderHook(() => {
            useKeySequence(["g", "i"], onMatch);
        });

        fireKey({ key: "g", code: "KeyG" });
        expect(onMatch).not.toHaveBeenCalled();

        fireKey({ key: "i", code: "KeyI" });
        expect(onMatch).toHaveBeenCalledTimes(1);
    });

    it("normalizes un-normalized target sequences", () => {
        const onMatch = vi.fn();
        renderHook(() => {
            useKeySequence(["Shift+Ctrl+K"], onMatch);
        });

        fireKey({ key: "k", code: "KeyK", ctrlKey: true, shiftKey: true });
        expect(onMatch).toHaveBeenCalledTimes(1);
    });

    it("uses default 2000ms timeout when timeoutMs is omitted", () => {
        const onMatch = vi.fn();
        renderHook(() => {
            useKeySequence(["a", "b"], onMatch);
        });

        fireKey({ key: "a", code: "KeyA" });

        act(() => {
            vi.advanceTimersByTime(1900);
        });

        act(() => {
            vi.advanceTimersByTime(101);
        });

        fireKey({ key: "b", code: "KeyB" });
        expect(onMatch).not.toHaveBeenCalled();
    });

    it("resets buffer when custom timeout expires", () => {
        const onMatch = vi.fn();
        renderHook(() => {
            useKeySequence(["a", "b"], onMatch, 500);
        });

        fireKey({ key: "a", code: "KeyA" });

        act(() => {
            vi.advanceTimersByTime(501);
        });

        fireKey({ key: "b", code: "KeyB" });
        expect(onMatch).not.toHaveBeenCalled();
    });

    it("clears and restarts timeout on consecutive non-matching key presses", () => {
        const onMatch = vi.fn();
        renderHook(() => {
            useKeySequence(["a", "b", "c"], onMatch, 1000);
        });

        fireKey({ key: "a", code: "KeyA" });

        act(() => {
            vi.advanceTimersByTime(800);
        });

        fireKey({ key: "b", code: "KeyB" });

        act(() => {
            vi.advanceTimersByTime(800);
        });

        fireKey({ key: "c", code: "KeyC" });
        expect(onMatch).toHaveBeenCalledTimes(1);
    });

    it("resets the buffer after a successful match", () => {
        const onMatch = vi.fn();
        renderHook(() => {
            useKeySequence(["a", "b"], onMatch);
        });

        fireKey({ key: "a", code: "KeyA" });
        fireKey({ key: "b", code: "KeyB" });
        expect(onMatch).toHaveBeenCalledTimes(1);

        fireKey({ key: "b", code: "KeyB" });
        expect(onMatch).toHaveBeenCalledTimes(1);

        fireKey({ key: "a", code: "KeyA" });
        fireKey({ key: "b", code: "KeyB" });
        expect(onMatch).toHaveBeenCalledTimes(2);
    });

    it("slides buffer window when sequence is longer than target", () => {
        const onMatch = vi.fn();
        renderHook(() => {
            useKeySequence(["a", "b"], onMatch);
        });

        fireKey({ key: "x", code: "KeyX" });
        fireKey({ key: "a", code: "KeyA" });
        fireKey({ key: "b", code: "KeyB" });

        expect(onMatch).toHaveBeenCalledTimes(1);
    });

    it("ignores key events originating from input elements", () => {
        const onMatch = vi.fn();
        renderHook(() => {
            useKeySequence(["a"], onMatch);
        });

        const input: HTMLInputElement = document.createElement("input");
        document.body.appendChild(input);
        fireKey({ key: "a", code: "KeyA" }, input);

        expect(onMatch).not.toHaveBeenCalled();
        input.remove();
    });

    it("ignores key events originating from textarea elements", () => {
        const onMatch = vi.fn();
        renderHook(() => {
            useKeySequence(["a"], onMatch);
        });

        const textarea: HTMLTextAreaElement = document.createElement("textarea");
        document.body.appendChild(textarea);
        fireKey({ key: "a", code: "KeyA" }, textarea);

        expect(onMatch).not.toHaveBeenCalled();
        textarea.remove();
    });

    it("ignores key events originating from contentEditable elements", () => {
        const onMatch = vi.fn();
        renderHook(() => {
            useKeySequence(["a"], onMatch);
        });

        const editable: HTMLDivElement = document.createElement("div");
        Object.defineProperty(editable, "isContentEditable", {
            get: (): boolean => true,
            configurable: true,
        });
        document.body.appendChild(editable);

        fireKey({ key: "a", code: "KeyA" }, editable);

        expect(onMatch).not.toHaveBeenCalled();
        editable.remove();
    });

    it("allows key events originating from regular non-editable HTML elements", () => {
        const onMatch = vi.fn();
        renderHook(() => {
            useKeySequence(["a"], onMatch);
        });

        const button: HTMLButtonElement = document.createElement("button");
        document.body.appendChild(button);
        fireKey({ key: "a", code: "KeyA" }, button);

        expect(onMatch).toHaveBeenCalledTimes(1);
        button.remove();
    });

    it("ignores bare modifier keydowns without breaking sequence", () => {
        const onMatch = vi.fn();
        renderHook(() => {
            useKeySequence(["a", "b"], onMatch);
        });

        fireKey({ key: "a", code: "KeyA" });
        fireKey({ key: "Shift", code: "ShiftLeft" });
        fireKey({ key: "b", code: "KeyB" });

        expect(onMatch).toHaveBeenCalledTimes(1);
    });

    it("cleans up event listener and pending timeout on unmount", () => {
        const onMatch = vi.fn();
        const { unmount } = renderHook(() => {
            useKeySequence(["a"], onMatch, 1000);
        });

        fireKey({ key: "x", code: "KeyX" });

        unmount();

        fireKey({ key: "a", code: "KeyA" });
        expect(onMatch).not.toHaveBeenCalled();

        act(() => {
            vi.runAllTimers();
        });
    });

    it("updates behavior when hook dependencies change", () => {
        const onMatch1 = vi.fn();
        const onMatch2 = vi.fn();

        const { rerender } = renderHook(
            ({ seq, cb }: { seq: string[]; cb: () => void }): void => {
                useKeySequence(seq, cb);
            },
            { initialProps: { seq: ["a"], cb: onMatch1 } }
        );

        fireKey({ key: "a", code: "KeyA" });
        expect(onMatch1).toHaveBeenCalledTimes(1);

        rerender({ seq: ["b"], cb: onMatch2 });

        fireKey({ key: "a", code: "KeyA" });
        expect(onMatch2).not.toHaveBeenCalled();

        fireKey({ key: "b", code: "KeyB" });
        expect(onMatch2).toHaveBeenCalledTimes(1);
    });
});