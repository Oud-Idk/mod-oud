'use client';

import { useState, useEffect, JSX } from 'react';
import dynamic from 'next/dynamic';
import { ScrollableMarkdownViewer } from "@/components/ui/markdown/ScrollableMarkdownViewer";
import { useTheme } from "next-themes";

const MonacoMarkdownEditor = dynamic(
    () => import('./MarkdownEditor').then(mod => mod.MarkdownEditor),
    {
        ssr: false,
        loading: () => <div className="w-full h-full bg-neutral-800 rounded-md animate-pulse" />
    }
);

interface MarkdownInputProps {
    value?: string;
    onChange: (value: string | undefined) => void;
    heightClassName?: string;
}

export function MarkdownEditorRenderer({
    value,
    onChange,
    heightClassName = 'h-60'
}: MarkdownInputProps): JSX.Element {
    const { resolvedTheme } = useTheme();
    const [viewMode, setViewMode] = useState<'editor' | 'preview'>('editor');
    const [editorValue, setEditorValue] = useState(value);
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(editorValue);
            onChange(editorValue);
        }, 500);

        return () => {
            clearTimeout(handler);
        };
    }, [editorValue, onChange]);

    useEffect(() => {
        setEditorValue(value);
        setDebouncedValue(value);
    }, [value]);

    return (
        <div>
            <div className="md:hidden flex border-b border-neutral-200 dark:border-neutral-700 mb-2">
                <button
                    type="button"
                    onClick={() => { setViewMode('editor'); }}
                    className={`px-4 py-2 text-sm font-medium ${
                        viewMode === 'editor'
                            ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                            : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                    }`}
                >
                    Write
                </button>
                <button
                    type="button"
                    onClick={() => { setViewMode('preview'); }}
                    className={`px-4 py-2 text-sm font-medium ${
                        viewMode === 'preview'
                            ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                            : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
                    }`}
                >
                    Preview
                </button>
            </div>

            <div className="md:flex md:flex-row md:gap-3">
                <div className={`w-full ${heightClassName} border rounded-md dark:border-neutral-600 overflow-hidden ${viewMode === 'editor' ? 'block' : 'hidden'} md:block`}>
                    <MonacoMarkdownEditor
                        value={editorValue}
                        onChange={(newValue) => { setEditorValue(newValue ?? ''); }}
                    />
                </div>
                <ScrollableMarkdownViewer
                    content={debouncedValue}
                    className={`w-full ${heightClassName} border dark:border-neutral-600 rounded-md ${viewMode === 'preview' ? 'block' : 'hidden'} md:block ${resolvedTheme === 'dark' ? 'scrollbar-thin-dark' : 'scrollbar-thin'}`}
                    markdownClassName="p-2"
                />
            </div>
        </div>
    );
}