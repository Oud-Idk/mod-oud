'use client';

import Editor from '@monaco-editor/react';
import { useTheme } from "next-themes";
import { JSX } from "react";

interface MarkdownEditorProps {
    value?: string;
    onChange: (value: string | undefined) => void;
}

export const MarkdownEditor = ({ value, onChange }: MarkdownEditorProps): JSX.Element => {
    const { resolvedTheme } = useTheme();

    return (
        <Editor
            language="markdown"
            theme={resolvedTheme === 'dark' ? 'vs-dark' : 'light'}
            value={value}
            onChange={onChange}
            options={{
                wordWrap: 'on',
                scrollbar: { vertical: 'auto' },
                fontFamily: 'var(--font-jetbrains-mono)',
                fontSize: 14,
                lineNumbers: 'on',
                glyphMargin: false,
                folding: false,

                padding: {
                    top: 12,
                    bottom: 12,
                },
                lineDecorationsWidth: 12,
                lineNumbersMinChars: 2,
            }}
        />
    );
};