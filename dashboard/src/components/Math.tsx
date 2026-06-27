import katex from 'katex';

interface MathProps {
    tex: string;
    display?: boolean;
}

export default function Math({ tex, display = false }: MathProps) {
    const html = katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        fleqn: true,
    });

    if (display) {
        return <div dangerouslySetInnerHTML={{ __html: html }}/>;
    }

    return <span dangerouslySetInnerHTML={{ __html: html }}/>;
}