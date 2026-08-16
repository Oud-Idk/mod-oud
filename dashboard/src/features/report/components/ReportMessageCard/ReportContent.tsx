"use client";

import Image from "next/image";
import { JSX } from "react";

interface ReportContentProps {
    authorName: string;
    reporterName: string;
    messageContent: string;
    reason: string;
    attachmentUrl?: string | null;
    onImageClick: (url: string) => void;
}

export function ReportContent({
    authorName,
    reporterName,
    messageContent,
    reason,
    attachmentUrl,
    onImageClick,
}: ReportContentProps): JSX.Element {
    const cleanContent = messageContent.trim();
    const attachments = typeof attachmentUrl === 'string' ? attachmentUrl.split(",").map(u => u.trim()) : [];

    return (
        <div className="space-y-2">
            <div className="text-sm mb-0">
                Author: <code className="py-0.5 rounded">{authorName}</code>{" "}&nbsp;|&nbsp;
                Reporter: <code className="py-0.5 rounded">{reporterName}</code>
            </div>

            {cleanContent !== "" && (
                <div className="p-1 rounded text-[0.9rem] my-1">
                    &quot;{cleanContent}&quot; </div>
            )}

            <div className="mb-0">
                Reason: {reason}
            </div>

            {attachments.length > 0 && (
                <div>
                    <p>Attachments:</p>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                        {attachments.map((url, idx) => (
                            <button
                                key={idx}
                                type="button"
                                onClick={() => { onImageClick(url); }}
                                className="group relative block overflow-hidden rounded border border-neutral-800/50 hover:border-neutral-500/50 cursor-zoom-in text-left"
                            >
                                <Image
                                    src={url}
                                    alt={`Attachment ${idx.toString()}`}
                                    className="text-xs hover:underline px-2 py-0.5 rounded border"
                                    width={200}
                                    height={200}
                                />
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}