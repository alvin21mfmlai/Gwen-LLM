'use client';
import { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Icon } from './icons';

function CodeBlock({ children, lang }) {
  const [copied, setCopied] = useState(false);
  const text = String(children?.props?.children ?? '').replace(/\n$/, '');
  return (
    <div className="code-block">
      <div className="code-head">
        <span>{lang || 'text'}</span>
        <button type="button" onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          <Icon name={copied ? 'check' : 'copy'} size={14} /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

const interactive = {
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  pre: ({ node, children }) => {
    const cls = children?.props?.className || '';
    return <CodeBlock lang={(/language-(\S+)/.exec(cls) || [])[1]}>{children}</CodeBlock>;
  },
  table: ({ node, ...props }) => <div className="table-wrap"><table {...props} /></div>,
  img: ({ node, src, alt }) => (typeof src === 'string' && /^(https:|\/api\/files\/)/.test(src) ? <img src={src} alt={alt || ''} loading="lazy" /> : null),
};

const plainComponents = {
  img: () => null,
};

function Markdown({ text, plain = false }) {
  return (
    <div className="md-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={plain ? plainComponents : interactive}>
        {text || ''}
      </ReactMarkdown>
    </div>
  );
}

export default memo(Markdown);
