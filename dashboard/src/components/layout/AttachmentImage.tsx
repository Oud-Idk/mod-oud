"use client";

import Image from "next/image";
import { ReactNode, useState } from "react";

interface AttachmentProps {
    url: string;
    index: number;
}

export function AttachmentImage({ url, index }: AttachmentProps): ReactNode | null {
    const [hasError, setHasError] = useState(false);

    if (hasError) return null;

    return (
        <Image
            src={url}
            alt={`Attachment ${index + 1}`}
            width={200}
            height={150}
            className="max-w-50 max-h-37.5 object-contain block transition-opacity"
            onError={() => setHasError(true)}
        />
    );
}