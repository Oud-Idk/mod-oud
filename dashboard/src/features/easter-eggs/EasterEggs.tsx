'use client';

import { useRouter } from 'next/navigation';
import { useKeySequence } from './useKeySequence';
import Uwuifier from 'uwuifier';
import { Modal } from "@/components/ui/Modal";
import { JSX, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { notoEmoji } from "@/lib/fonts";
import { toast } from "sonner";
import { MarkdownRenderer } from "@/components/ui/markdown/MarkdownRenderer";
import { BORROW_CHECK } from "@/features/easter-eggs/contents";

const MEE6_SEQUENCE: string[] = ['m', 'e', 'e', '6'];
const IF_YOU_FOUND_THIS_OUT_IM_CALLING_A_PRIEST: string[] = ['l', 'e', 'o', 'n', 'shift+7', 's', 'k', 'y'];
const UWU: string[] = ['u', 'w', 'u'];
const LINUX: string[] = ['l', 'i', 'n', 'u', 'x'];
const SUDO: string[] = ['s', 'u', 'd', 'o'];
const CARL: string[] = ['c', 'a', 'r', 'l'];
const RUST: string[] = ['r', 'u', 's', 't'];


const uwuifier = new Uwuifier({
    spaces: {
        faces: 0.3,
        actions: 0.3,
        stutters: 0.2,
    },
});

export function traverseDOM(callback: (text: string) => string): void {
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
            node.nodeValue = callback(node.nodeValue);
        }
    }
}

export function EasterEggs(): JSX.Element {
    const router = useRouter();
    const [showLeonSky, setShowLeonSky] = useState(false);
    const [showCarl, setShowCarl] = useState(false);
    const [carlId, setCarlId] = useState(0);
    const [showRust, setShowRust] = useState(false);

    useKeySequence(MEE6_SEQUENCE, () => {
        router.push('/ew');
    });

    useKeySequence(IF_YOU_FOUND_THIS_OUT_IM_CALLING_A_PRIEST, () => {
        console.log("If you didn't read the source code, I wouldn't believe you, furry.");
        setShowLeonSky(true);
    });

    useKeySequence(UWU, () => {
        traverseDOM(uwuifier.uwuifySentence.bind(uwuifier));
    });

    useKeySequence(LINUX, () => {
        traverseDOM(() => "I'd just like to interject for a moment. What you're refering to as Linux, is in fact, GNU/Linux, or as I've recently taken to calling it, GNU plus Linux. Linux is not an operating system unto itself, but rather another free component of a fully functioning GNU system made useful by the GNU corelibs, shell utilities and vital system components comprising a full OS as defined by POSIX.");
    });

    useKeySequence(SUDO, () => {
        toast.error(<Link href="https://xkcd.com/838/" className="hover:underline text-brand font-medium">mod_oud is not in the sudoers file. This incident will be reported.</Link>);
    });

    useKeySequence(CARL, () => {
        setCarlId((prev) => prev + 1);
        setShowCarl(true);
    });

    useKeySequence(['c', 's', 's'], () => {
        document.body.style.fontFamily = '"Comic Sans MS", cursive, sans-serif';
        document.body.style.filter = 'hue-rotate(180deg) saturate(200%) contrast(300%) brightness(400%)';
        toast("Graphic design is my passion");
    });

    useKeySequence(RUST, () => {
        setShowRust(true);
    });

    useKeySequence(['r', 'o', 'l', 'l'], () => {
        document.body.style.transition = 'transform 1s ease-in-out';
        document.body.style.transform = 'rotate(720deg)';
        setTimeout(() => {
            document.body.style.transform = '';
        }, 2000);
    })

    return (
        <>
            {showLeonSky && (
                <Modal uncloseable headerText="A message from the fire department">
                    {/* TODO get this commissioned */}
                    Uhh, I still need to get a Leon & Sky fanart commissioned. Imagine you saw something shocking here :o
                    And imagine if the Image has title="Mod Oud will forever me free as in free beer and free speech, and I am maintaining this without the expectation of profit and hosting this with my own money. But I am going to spend $45 on Leon & Sky fanart because... I am totally financially responsible"
                </Modal>
            )}
            {showCarl && (
                <div
                    key={carlId}
                    onAnimationEnd={() => { setShowCarl(false) }}
                    className={cn("fixed bottom-1/2 right-0 translate-y-1/2 select-none pointer-events-none z-100 text-[800px]", notoEmoji.className)}
                    style={{
                        animation: 'turtle-walk 30s linear forwards',
                    }}
                >
                    🐢
                    <style>{`
                        @keyframes turtle-walk {
                            0% {
                                transform: translateX(950px);
                            }
                            100% {
                                transform: translateX(calc(-100vw));
                            }
                        }
                    `}</style>
                </div>
            )}
            {showRust && (
                <Modal onClose={() => { setShowRust(false) }} headerText="Borrow Checker" className="max-w-300">
                    <MarkdownRenderer className="text-danger" content={`\`\`\`\n${BORROW_CHECK}\`\`\``} />
                </Modal>
            )}
        </>
    );
}