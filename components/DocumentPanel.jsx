'use client';
import { useEffect, useRef, useState } from 'react';
import Markdown from './Markdown';
import { Icon } from './icons';
import { ExportMenu } from './Message';

export default function DocumentPanel({ doc, streaming, onClose, onSave, onError }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [title, setTitle] = useState('');
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef(null);
  const writing = streaming && !doc.complete;

  // follow the text while it is being written
  useEffect(() => {
    if (writing && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [doc.body, writing]);

  useEffect(() => { setEditing(false); }, [doc.key]);

  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape' && !editing) onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [editing, onClose]);

  const markdown = doc.body;

  return (
    <aside className="doc-panel" aria-label={`Document: ${doc.title}`}>
      <header className="doc-head">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close document" title="Close"><Icon name="x" size={20} /></button>
        <div className="doc-head-title">
          {editing ? <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Document title" /> : <h2>{doc.title}</h2>}
          {writing && <span className="doc-writing"><span className="spinner small" /> Writing…</span>}
        </div>
        {!writing && !editing && (
          <div className="doc-tools">
            <button type="button" className="btn ghost" onClick={() => { setDraft(markdown); setTitle(doc.title); setEditing(true); }}><Icon name="pen" size={16} /><span>Edit</span></button>
            <button type="button" className="btn ghost" onClick={() => { navigator.clipboard?.writeText(markdown); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
              <Icon name={copied ? 'check' : 'copy'} size={16} /><span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <ExportMenu title={doc.title} markdown={markdown} onError={onError} />
          </div>
        )}
        {editing && (
          <div className="doc-tools">
            <button type="button" className="btn ghost" onClick={() => setEditing(false)}>Cancel</button>
            <button type="button" className="btn primary" onClick={() => { onSave(draft, title.trim() || doc.title); setEditing(false); }}>Save</button>
          </div>
        )}
      </header>
      <div className="doc-scroll" ref={scrollRef}>
        {editing ? (
          <textarea className="doc-editor" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Document text (Markdown)" spellCheck />
        ) : (
          <article className="doc-paper">
            <Markdown text={markdown} />
          </article>
        )}
      </div>
      {editing && <div className="doc-hint">You are editing the text in Markdown: <code>#</code> heading, <code>**bold**</code>, <code>- list</code>.</div>}
    </aside>
  );
}
