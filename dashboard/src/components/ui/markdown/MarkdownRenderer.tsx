"use client";

import 'katex/dist/katex.min.css';

import React, { FC, ReactNode, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { ClipboardDocumentIcon, CheckIcon } from '@heroicons/react/24/outline';
import { vscDarkPlus, oneLight } from "react-syntax-highlighter/dist/cjs/styles/prism";
import { useTheme } from "next-themes";
import { Element } from 'hast';

import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeKatex from "rehype-katex";
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import remarkDirective from 'remark-directive';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeRaw from 'rehype-raw';
import { Linguist } from "@/lib/linguist";

interface PreProps {
    node?: Element;
    className?: string;
    children?: ReactNode;
}

const CodeBlock: FC<PreProps> = ({ children, ...props }) => {
    const [isCopied, setIsCopied] = useState(false);
    const { resolvedTheme } = useTheme();
    const child = React.Children.toArray(children)[0];

    if (
        React.isValidElement(child) &&
        typeof child.props === 'object' &&
        child.props !== null &&
        'children' in child.props
    ) {
        let match;
        if ('className' in child.props && typeof child.props.className === 'string') {
            match = /language-(\w+)/.exec(child.props.className);
        }
        const language = match ? match[1] : 'plaintext';
        const code = child.props.children;
        const languageName = Linguist.get(language);

        const handleCopy = async (): Promise<void> => {
            if (!code) return;
            try {
                await navigator.clipboard.writeText(String(code ?? ""));
                setIsCopied(true);
                setTimeout(() =>{  setIsCopied(false); }, 2000);
            } catch (err) {
                console.error("Failed to copy code: ", err);
            }
        };

        return (
            <div className="relative group bg-surface-muted my-4 rounded-xl border border-border overflow-hidden shadow-xs transition-all">
                {/* Code Block Header */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-surface/50 text-xs font-mono text-muted-foreground">
                    <span className="font-medium tracking-wide uppercase">{languageName ?? "Plaintext"}</span>
                    <button
                        onClick={handleCopy}
                        aria-label="Copy code"
                        type="button"
                        className="inline-flex items-center gap-1.5 px-2 py-1 bg-surface rounded-md text-xs font-sans text-muted-foreground hover:text-foreground hover:bg-surface-active border border-border-subtle transition-all focus-ring"
                    >
                        {isCopied ? (
                            <>
                                <CheckIcon className="h-3.5 w-3.5 text-success" />
                                <span className="text-success font-medium">Copied!</span>
                            </>
                        ) : (
                            <>
                                <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                                <span>Copy</span>
                            </>
                        )}
                    </button>
                </div>

                {/* Syntax Highlighter Container */}
                <div className="p-3 overflow-x-auto text-sm">
                    <SyntaxHighlighter
                        codeTagProps={{ style: { fontFamily: 'var(--font-jetbrains-mono)' } }}
                        style={resolvedTheme === 'dark' ? vscDarkPlus : oneLight}
                        language={language}
                        wrapLines={true}
                        wrapLongLines={true}
                        customStyle={{
                            padding: "0",
                            margin: "0",
                            background: "transparent",
                            fontSize: "0.875rem",
                            lineHeight: "1.6",
                        }}
                        {...props}
                    >
                        {String(code ?? '').replace(/\n$/, '')}
                    </SyntaxHighlighter>
                </div>
            </div>
        );
    }

    return <pre className="my-4 p-3 bg-surface-muted rounded-xl border border-border overflow-x-auto font-mono text-sm" {...props}>{children}</pre>;
};

const markdownComponents: Components & Record<string, React.ElementType> = {
    hr() {
        return <hr className="my-8 border-border" />;
    },
    p({ children }) {
        const containsBlockElement = React.Children.toArray(children).some(
            (child) => React.isValidElement(child) && child.type === SyntaxHighlighter
        );

        if (containsBlockElement) {
            return <>{children}</>;
        }
        return <p className="my-1! mb-2! leading-relaxed text-foreground last:mb-0">{children}</p>;
    },
    code({ className, children, ...props }) {
        return (
            <code
                className={`${className ?? ""} bg-surface-muted text-foreground border border-border-subtle px-1.5 py-0.5 rounded-md text-xs font-mono font-normal inline-block`}
                style={{ fontFamily: 'var(--font-jetbrains-mono)' }}
                {...props}
            >
                {children}
            </code>
        );
    },
    pre: (props: PreProps) => <CodeBlock {...props} />,
    input({ type, checked }) {
        return (
            <input
                type={type}
                checked={checked}
                readOnly
                className="mr-2 rounded border-border text-brand accent-brand align-middle focus-ring"
            />
        );
    },
    a(props) {
        const { className, ...rest } = props;
        return (
            <a
                className={`${className ?? ""} text-brand hover:text-brand-hover underline underline-offset-4 decoration-brand/40 hover:decoration-brand font-medium transition-colors wrap-break-word break-all focus-ring rounded-xs`}
                {...rest}
            />
        );
    },
};

export const MarkdownRenderer = React.memo(({ content, className }: { content?: string; className?: string }) => {
    return (
        <div
            className={`
                ${className ?? ''} 
                prose dark:prose-invert max-w-none w-full wrap-break-word
                prose-headings:text-foreground prose-headings:font-semibold prose-headings:tracking-tight
                prose-h1:text-4xl prose-h1:mt-8 prose-h1:mb-4 prose-h1:first:mt-0
                prose-h2:text-xl prose-h2:mt-6 prose-h2:mb-3
                prose-h3:text-lg prose-h3:mt-5 prose-h3:mb-2
                prose-ul:my-0 prose-ol:my-4 prose-li:my-0 prose-li:text-foreground
                prose-blockquote:border-l-brand prose-blockquote:bg-surface-muted/20 prose-blockquote:py-0.5 prose-blockquote:px-4 prose-blockquote:rounded-r-xl prose-blockquote:not-italic prose-blockquote:my-4
                prose-img:rounded-xl prose-img:border prose-img:border-border prose-img:my-6
            `}
        >
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath, remarkBreaks, remarkDirective]}
                rehypePlugins={[
                    rehypeRaw,
                    rehypeKatex,
                    rehypeSlug,
                    [rehypeAutolinkHeadings],
                    [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }],
                ]}
                components={markdownComponents}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
});

MarkdownRenderer.displayName = "MarkdownRenderer";