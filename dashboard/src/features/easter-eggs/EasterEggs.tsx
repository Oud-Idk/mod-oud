'use client';

import { useRouter } from 'next/navigation';
import { useKeySequence } from './useKeySequence';
import Uwuifier from 'uwuifier';

const MEE6_SEQUENCE: string[] = ['m', 'e', 'e', '6'];
const IF_YOU_FOUND_THIS_OUT_IM_CALLING_A_PRIEST: string[] = ['l', 'e', 'o', 'n', 'shift+7', 's', 'k', 'y'];
const UWU: string[] = ['u', 'w', 'u']
const uwuifier = new Uwuifier({
    spaces: {
        faces: 0.3,
        actions: 0.3,
        stutters: 0.2,
    },
});

export function uwuifyDOM(): void {
    const IGNORED_TAGS: readonly string[] = [
        'SCRIPT',
        'STYLE',
        'NOSCRIPT',
        'CODE',
        'PRE',
        'INPUT',
        'TEXTAREA'
    ];

    const walker: TreeWalker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
            acceptNode(node: Node): number {
                const parent: HTMLElement | null = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;

                // Skip dangerous or interactive tags
                if (IGNORED_TAGS.includes(parent.tagName)) {
                    return NodeFilter.FILTER_REJECT;
                }

                // Skip whitespace-only strings
                if (node.nodeValue?.trim().length === 0) {
                    return NodeFilter.FILTER_REJECT;
                }

                return NodeFilter.FILTER_ACCEPT;
            }
        }
    );

    const textNodes: Text[] = [];
    let current: Node | null = walker.nextNode();

    while (current !== null) {
        if (current instanceof Text) {
            textNodes.push(current);
        }
        current = walker.nextNode();
    }

    for (const node of textNodes) {
        if (node.nodeValue !== null) {
            node.nodeValue = uwuifier.uwuifySentence(node.nodeValue);
        }
    }
}

export function EasterEggs(): null {
    const router = useRouter();

    useKeySequence(MEE6_SEQUENCE, () => {
        router.push('/ew');
    });

    useKeySequence(IF_YOU_FOUND_THIS_OUT_IM_CALLING_A_PRIEST, () => {
        // Perhaps we can dangerouslySetInnerHtml :skull:
        console.log("If you didn't read the source code, I wouldn't believe you, furry.")
    });

    useKeySequence(UWU, () => {
        uwuifyDOM();
    });


    return null;
}