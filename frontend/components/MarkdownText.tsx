import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

interface MarkdownTextProps {
  content: string;
  className?: string;
}

const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS = [rehypeKatex];

function MarkdownText({ content, className = '' }: MarkdownTextProps) {
  return (
    <div className={`markdown-body break-words ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        skipHtml
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default memo(MarkdownText);
