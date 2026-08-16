import { JSX } from "react";
import fs from 'node:fs/promises';
import path from 'node:path';
import { MarkdownRenderer } from "@/components/ui/markdown/MarkdownRenderer";

export const dynamic = 'force-dynamic';

function countLinesAfterString(text: string, target: string): number {
    const lines = text.split('\n');
    const index = lines.findIndex(line => line.includes(target));

    if (index === -1) return 0;

    return (lines.length - 1) - index;
}

export default async function SecretPage(): Promise<JSX.Element> {
    const filePath = path.join(process.cwd(), 'love.md');
    const content = await fs.readFile(filePath, 'utf8');

    const words = content.split(/\s+/).filter(Boolean).length;
    const readingTime = Math.ceil(words / 225);
    const citationCount = countLinesAfterString(content, "# References");


    return (
        <div className="relative min-h-screen pb-16">
           <main className="mx-auto px-6 py-10 max-w-5xl">
               <MarkdownRenderer content={content} />
           </main>

           <footer className="fixed bottom-0 left-0 right-0 z-50 border-t backdrop-blur-md py-3">
               <div className="max-w-4xl mx-auto px-6 flex justify-between items-center text-xs font-jetbrains-mono tracking-widest gap-4 uppercase">
                   <div className="flex gap-6">
                       <span className="flex flex-col">
                           <span className="text-[10px] italic">Word Count</span>
                           <span>{words.toLocaleString()}</span>
                       </span>
                       <span className="flex flex-col">
                           <span className="text-[10px] italic">Time</span>
                           <span>{readingTime} Min</span>
                       </span>
                       <span className="flex flex-col">
                           <span className="text-[10px] italic">Cites</span>
                           <span>{citationCount}</span>
                       </span>
                   </div>
               </div>
           </footer>
       </div>
   )
}