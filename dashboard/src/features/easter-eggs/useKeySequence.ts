import { useEffect, useRef } from 'react';

/**
 * Normalizes a shortcut descriptor (e.g. "Ctrl+Shift+K" -> "ctrl+shift+k")
 * into a predictable canonical order: ctrl -> alt -> shift -> meta -> key
 */
function normalizeChord(chord: string): string {
    const pieces: string[] = chord.toLowerCase().split('+').map((s) => s.trim());
    const key: string | undefined = pieces.pop();
    if (key === undefined) return '';

    const hasCtrl: boolean = pieces.includes('ctrl') || pieces.includes('control');
    const hasAlt: boolean = pieces.includes('alt');
    const hasShift: boolean = pieces.includes('shift');
    const hasMeta: boolean =
        pieces.includes('meta') || pieces.includes('cmd') || pieces.includes('command');

    const ordered: string[] = [];
    if (hasCtrl) ordered.push('ctrl');
    if (hasAlt) ordered.push('alt');
    if (hasShift) ordered.push('shift');
    if (hasMeta) ordered.push('meta');
    ordered.push(key);

    return ordered.join('+');
}

/**
 * Converts a KeyboardEvent into our canonical chord string.
 * If the user just pressed a bare modifier (like tapping Shift alone), returns null.
 */
function getEventChord(event: KeyboardEvent): string | null {
    const keyLower: string = event.key.toLowerCase();

    if (['control', 'alt', 'shift', 'meta'].includes(keyLower)) {
        return null;
    }

    const parts: string[] = [];
    if (event.ctrlKey) parts.push('ctrl');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    if (event.metaKey) parts.push('meta');

    let keyName: string = keyLower;
    if (event.code.startsWith('Digit')) {
        keyName = event.code.replace('Digit', '').toLowerCase(); // e.g. "7"
    }

    parts.push(keyName);
    return parts.join('+');
}

export function useKeySequence(
    targetSequence: readonly string[],
    onMatch: () => void,
    timeoutMs = 2000
): void {
    const bufferRef = useRef<string[]>([]);
    const timeoutIdRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        // Pre-normalize the target sequence so matching is fast
        const normalizedTarget: string[] = targetSequence.map(normalizeChord);

        const handleKeyDown = (event: KeyboardEvent): void => {
            // Type guards instead of assertions (oxc safe!)
            if (
                event.target instanceof HTMLInputElement ||
                event.target instanceof HTMLTextAreaElement ||
                (event.target instanceof HTMLElement && event.target.isContentEditable)
            ) {
                return;
            }

            const chord: string | null = getEventChord(event);
            if (chord === null) return; // Ignore bare modifier keydown (e.g. just pressing 'Shift')

            if (timeoutIdRef.current !== null) {
                clearTimeout(timeoutIdRef.current);
            }

            bufferRef.current.push(chord);
            if (bufferRef.current.length > normalizedTarget.length) {
                bufferRef.current.shift();
            }

            const isMatch: boolean = normalizedTarget.every(
                (targetChord, index) => targetChord === bufferRef.current[index]
            );

            if (isMatch) {
                onMatch();
                bufferRef.current = [];
            } else {
                timeoutIdRef.current = setTimeout(() => {
                    bufferRef.current = [];
                }, timeoutMs);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            if (timeoutIdRef.current !== null) {
                clearTimeout(timeoutIdRef.current);
            }
        };
    }, [targetSequence, onMatch, timeoutMs]);
}