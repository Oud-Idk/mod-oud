import { JSX } from "react";
import fs from 'node:fs/promises';
import path from 'node:path';
import { MarkdownWithToc } from "@/components/ui/markdown/MarkdownWithToC";

export const dynamic = 'force-dynamic';

/**
 * Counts actual citation bullet points in the # References section
 * without accidentally counting the legalities, disclaimers, or empty lines.
 */
function countCitations(markdown: string): number {
    const lines = markdown.split('\n');
    const refIndex = lines.findIndex(line => /^#\s+References/i.test(line.trim()));

    if (refIndex === -1) return 0;

    let count = 0;

    for (let i = refIndex + 1; i < lines.length; i++) {
        const line = lines[i].trim();

        // Stop scanning once we hit the next markdown header or horizontal rule
        if (line.startsWith('#') || line.startsWith('---')) {
            break;
        }

        // Count bullet points (e.g. "- **Author (Year)**")
        if (/^[-*]\s+(\*\*|\[)/.test(line)) {
            count++;
        }
    }

    return count;
}

/**
 * Strips HTML comments, TOC markers, and code blocks for a clean word count
 */
function calculateWordCount(text: string): number {
    const cleaned = text
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/```[\s\S]*?```/g, '')
        .trim();

    return cleaned.split(/\s+/).filter(Boolean).length;
}

export default async function SecretPage(): Promise<JSX.Element> {
    const filePath = path.join(process.cwd(), 'love.md');
    const content = await fs.readFile(filePath, 'utf8');

    const words = calculateWordCount(content);
    const readingTime = Math.ceil(words / 225);
    const citationCount = countCitations(content);

    return (
        <div className="flex flex-col flex-1 h-full min-h-0 overflow-hidden w-full">
            <main className="flex-1 min-h-0 overflow-y-auto w-full">
                <div className="mx-auto px-6 py-10 max-w-5xl">
                    <MarkdownWithToc content={content}/>
                </div>
            </main>

            <footer
                className="shrink-0 z-20 backdrop-blur-md bg-surface/80 border-t border-border-subtle py-3">
                <div
                    className="max-w-4xl mx-auto px-6 flex justify-between items-center text-xs font-jetbrains-mono tracking-widest gap-4 uppercase">
                    <div className="flex gap-6">
                        <span className="flex flex-col">
                            <span className="text-[10px] text-muted-foreground">Word Count</span>
                            <span>{words.toLocaleString()}</span>
                        </span>
                        <span className="flex flex-col">
                            <span className="text-[10px] text-muted-foreground">Time</span>
                            <span>{readingTime} Min</span>
                        </span>
                        <span className="flex flex-col">
                            <span className="text-[10px] text-muted-foreground">Cites</span>
                            <span>{citationCount}</span>
                        </span>
                    </div>
                </div>
            </footer>
        </div>
    );
}