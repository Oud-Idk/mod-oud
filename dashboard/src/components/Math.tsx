import katex from 'katex';

export default function Math({ tex }: { tex: string }) {
    const html = katex.renderToString(tex);
    return <span dangerouslySetInnerHTML={{ __html: html }}/>;
}