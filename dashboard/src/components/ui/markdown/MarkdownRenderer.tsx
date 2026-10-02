"use client";

import 'katex/dist/katex.min.css';

import React, { ReactNode, useEffect, useState, type JSX } from "react";
import { Element } from 'hast';
import { useTheme } from "next-themes";

import ReactMarkdown, { Components } from "react-markdown";

import { getLinguist } from "@/lib/linguist";
import { rehypePlugins, remarkPlugins } from "@/lib/markdown-plugins";
import { CopyButton } from "@/components/ui/markdown/CopyButton";
import { normalizeLanguage, Prism as SyntaxHighlighter, themes } from "@/components/ui/markdown/prism";

interface CodeElementProps {
    className?: string;
    children?: ReactNode;
}

interface PreProps extends React.HTMLAttributes<HTMLPreElement> {
    _node?: Element;
    className?: string;
    children?: ReactNode;
}

// `useSyncExternalStore` wants an unsubscribe function; this component never
// subscribes to anything, so the callback is never called and the returned
// function is never called either.
/**
 * `resolvedTheme` is `undefined` on the server and on the first client render,
 * so reading it directly would give one answer during SSR and another during
 * hydration. This reports `false` until after mount, when the real theme is
 * known and React has already committed the server's markup.
 */
function useMounted(): boolean {
    const [mounted, setMounted] = useState(false);

    useEffect((): void => {
        setMounted(true);
    }, []);

    return mounted;
}

const CodeBlock = ({ children, style: preStyle, ...props }: PreProps): JSX.Element => {
    const { resolvedTheme } = useTheme();
    const mounted = useMounted();
    const child = React.Children.toArray(children)[0];

    if (React.isValidElement<CodeElementProps>(child)) {
        const className = child.props.className;
        // `\S+` rather than `\w+` so fences with punctuation survive: ```c++
        // and ```c# would otherwise truncate to "c" and highlight as C.
        const match = typeof className === "string" ? /language-(\S+)/.exec(className) : null;
        const fence = match?.[1] ?? "";

        const rawChildren = child.props.children;
        const code = typeof rawChildren === "string"
            ? rawChildren
            : Array.isArray(rawChildren)
                ? rawChildren.filter((c): c is string => typeof c === "string").join("")
                : "";

        // The fence name and the display label are separate concerns: the label
        // is the GitHub Linguist name, the grammar is whatever we registered
        // under after alias resolution. `null` means no grammar, so plain text.
        const language = normalizeLanguage(fence);
        const languageName = getLinguist(fence);

        // Light theme until mounted, then follow the resolved theme. Both
        // render passes agree on the first one, so hydration doesn't mismatch.
        const syntaxTheme = mounted && resolvedTheme === "dark" ? themes.dark : themes.light;

        return (
            <div className="relative group bg-surface-muted my-4 rounded-xl border border-border overflow-hidden shadow-xs transition-all">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle bg-surface/50 text-xs font-mono text-muted-foreground">
                    <span className="font-medium tracking-wide uppercase">{languageName ?? "Plaintext"}</span>

                    <CopyButton code={code} />
                </div>

                <div className="p-3 overflow-x-auto text-sm">
                    <SyntaxHighlighter
                        codeTagProps={{ style: { fontFamily: 'var(--font-jetbrains-mono)' } }}
                        {...(language !== null ? { language } : {})}
                        style={syntaxTheme}
                        wrapLines={true}
                        wrapLongLines={true}
                        customStyle={{
                            padding: "0",
                            margin: "0",
                            background: "transparent",
                            fontSize: "0.875rem",
                            lineHeight: "1.6",
                            ...preStyle,
                        }}
                    >
                        {code.replace(/\n$/, "")}
                    </SyntaxHighlighter>
                </div>
            </div>
        );
    }

    return (
        <pre
            style={preStyle}
            className="my-4 p-3 bg-surface-muted rounded-xl border border-border overflow-x-auto font-mono text-sm"
            {...props}
        >
            {children}
        </pre>
    );
};

const markdownComponents: Components & Record<string, React.ElementType> = {
    hr() {
        return <hr className="my-8 border-border" />;
    },
    p({ children }) {
        // A paragraph holding a block child (a code block) must not be wrapped in
        // a `<p>` or the browser closes it early and the layout breaks. Matching
        // on the block renderers we own, not on the highlighter component:
        // `pre` resolves to `CodeBlock`, so no child of `<p>` is ever the
        // highlighter itself and the old check could never fire.
        const hasBlockChild = React.Children.toArray(children).some(
            (child) => React.isValidElement(child) && (child.type === CodeBlock || child.type === "div")
        );

        if (hasBlockChild) {
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
                prose-headings:scroll-mt-24
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
                remarkPlugins={remarkPlugins}
                rehypePlugins={rehypePlugins}
                components={markdownComponents}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
});

MarkdownRenderer.displayName = "MarkdownRenderer";
