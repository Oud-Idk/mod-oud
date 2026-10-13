import DOMPurify from 'isomorphic-dompurify';
import katex from 'katex';
import { JSX } from "react";

interface MathProps {
    tex: string;
    display?: boolean;
}

export default function Math({ tex, display = false }: MathProps): JSX.Element {
    const html = katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        fleqn: true,
    });

    const cleanHtml = DOMPurify.sanitize(html);

    if (display) {
        // aislop-ignore-next-line security/dangerously-set-innerhtml
        return <div dangerouslySetInnerHTML={{ __html: cleanHtml }} />;
    }

    // aislop-ignore-next-line security/dangerously-set-innerhtml
    return <span dangerouslySetInnerHTML={{ __html: cleanHtml }} />;
}