import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface MarkdownTextProps {
  content: string;
  className?: string;
}

export default function MarkdownText({ content, className = '' }: MarkdownTextProps) {
  return (
    <div className={`markdown-body break-words ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        skipHtml
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
