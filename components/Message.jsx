'use client';
import { memo, useCallback, useRef, useState } from 'react';
import Markdown from './Markdown';
import { Icon } from './icons';
import { useOutside } from './useOutside';
import { splitDocuments, toPlainMarkdown } from '@/lib/client/segments';
import { exportDocx, exportPDF, exportMarkdown } from '@/lib/client/exporters';

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

export function ExportMenu({ title, markdown, onError, label = 'Download', compact }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useOutside(ref, open, close);
  const run = async (fn) => {
    setOpen(false);
    try { await fn(title, markdown); } catch (e) { onError?.(e.message || 'Export failed'); }
  };
  return (
    <div className="export" ref={ref}>
      <button type="button" className={compact ? 'act' : 'btn ghost'} onClick={() => setOpen((v) => !v)} aria-label={label} title={label} aria-expanded={open}>
        <Icon name="download" size={compact ? 16 : 16} />{!compact && <span>{label}</span>}
      </button>
      {open && (
        <div className="menu export-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => run(exportDocx)}><Icon name="doc" size={16} /> Word (.docx)</button>
          <button type="button" role="menuitem" onClick={() => run(exportPDF)}><Icon name="file" size={16} /> PDF</button>
          <button type="button" role="menuitem" onClick={() => run(exportMarkdown)}><Icon name="file" size={16} /> Markdown (.md)</button>
        </div>
      )}
    </div>
  );
}

function CopyButton({ text, label = 'Copy' }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="act" aria-label={label} title={label}
      onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}>
      <Icon name={done ? 'check' : 'copy'} size={16} />
    </button>
  );
}

function Attachments({ items }) {
  if (!items?.length) return null;
  return (
    <div className="msg-attachments">
      {items.map((a) => a.kind === 'image' ? (
        <a key={a.id} href={`/api/files/${a.id}`} target="_blank" rel="noreferrer" className="msg-thumb"><img src={`/api/files/${a.id}`} alt={a.name} loading="lazy" /></a>
      ) : (
        <a key={a.id} href={`/api/files/${a.id}?download`} className="msg-file">
          <span className="attach-icon"><Icon name={a.kind === 'pdf' ? 'doc' : 'file'} size={18} /></span>
          <span className="attach-meta"><span className="attach-name">{a.name}</span><span className="attach-size">{a.kind === 'pdf' ? 'PDF' : 'File'}</span></span>
        </a>
      ))}
    </div>
  );
}

function DocCard({ part, onOpen, streaming, onError }) {
  const preview = part.body.replace(/[#*_>`|-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180);
  return (
    <div className="doc-card">
      <button type="button" className="doc-card-main" onClick={onOpen}>
        <span className="doc-card-icon"><Icon name="doc" size={22} /></span>
        <span className="doc-card-text">
          <span className="doc-card-title">{part.title}</span>
          <span className="doc-card-sub">{streaming && !part.complete ? 'Writing…' : preview || 'Document'}</span>
        </span>
        <span className="doc-card-open">Open</span>
      </button>
      {part.complete && (
        <div className="doc-card-actions">
          <ExportMenu title={part.title} markdown={part.body} onError={onError} compact label="Download document" />
        </div>
      )}
    </div>
  );
}

function Message({ msg, isLast, busy, actions, modelLabel }) {
  const onError = actions.error;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.content);

  if (msg.role === 'user') {
    return (
      <div className="msg user" data-msg={msg.id}>
        <Attachments items={msg.attachments} />
        {editing ? (
          <form className="edit-box" onSubmit={(e) => { e.preventDefault(); setEditing(false); if (draft.trim()) actions.edit(msg.id, draft.trim()); }}>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus rows={Math.min(10, draft.split('\n').length + 1)} aria-label="Edit message" />
            <div className="edit-actions">
              <button type="button" className="btn ghost" onClick={() => { setEditing(false); setDraft(msg.content); }}>Cancel</button>
              <button type="submit" className="btn primary">Send</button>
            </div>
          </form>
        ) : (
          msg.content && <div className="bubble">{msg.content}</div>
        )}
        {!editing && msg.content && (
          <div className="msg-actions user-actions">
            <CopyButton text={msg.content} />
            {!busy && <button type="button" className="act" aria-label="Edit message" title="Edit" onClick={() => { setDraft(msg.content); setEditing(true); }}><Icon name="pen" size={16} /></button>}
          </div>
        )}
      </div>
    );
  }

  const parts = splitDocuments(msg.content || '');
  const streaming = !!msg.pending;
  const plain = toPlainMarkdown(msg.content || '');
  const firstDoc = parts.find((p) => p.type === 'doc');

  return (
    <div className="msg assistant" data-msg={msg.id}>
      {msg.status && streaming && (
        <div className="status-line"><span className="spinner small" /> {msg.status}</div>
      )}
      {streaming && !msg.content && !msg.status && <div className="thinking" aria-label="Thinking"><span /><span /><span /></div>}

      {parts.map((p, i) => p.type === 'doc'
        ? <DocCard key={i} part={p} streaming={streaming} onOpen={() => actions.openDoc(msg.id, p.index)} onError={onError} />
        : <Markdown key={i} text={p.text} />)}

      {msg.images?.length > 0 && (
        <div className="gen-images">
          {msg.images.map((img) => (
            <figure key={img.id} className="gen-image">
              <a href={`/api/files/${img.id}`} target="_blank" rel="noreferrer"><img src={`/api/files/${img.id}`} alt={msg.imagePrompt || 'Generated image'} /></a>
              <figcaption>
                <a className="btn ghost" href={`/api/files/${img.id}?download`} download={img.name}><Icon name="download" size={16} /> Download</a>
                <button type="button" className="btn ghost" onClick={() => actions.editImage(img)}><Icon name="brush" size={16} /> Edit</button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
      {msg.kind === 'image' && streaming && (
        <div className="image-placeholder"><span className="spinner" /> <span>Creating your image. This can take up to a minute.</span></div>
      )}

      {msg.error && (
        <div className="error-box" role="alert">
          <strong>Something went wrong.</strong> <span>{msg.error}</span>
          {isLast && !busy && <button type="button" className="btn ghost" onClick={() => actions.regenerate(msg.id)}><Icon name="refresh" size={15} /> Try again</button>}
        </div>
      )}
      {msg.stopped && <div className="stopped-note">Stopped</div>}

      {msg.sources?.length > 0 && (
        <div className="sources">
          <span className="sources-label">Sources</span>
          {msg.sources.slice(0, 8).map((s) => (
            <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="source" title={s.title || s.url}>
              <span className="source-host">{host(s.url)}</span>
              {s.title && <span className="source-title">{s.title}</span>}
            </a>
          ))}
        </div>
      )}

      {!streaming && (msg.content || msg.images?.length > 0) && (
        <div className="msg-actions">
          {msg.content && <CopyButton text={plain} />}
          {msg.content && <ExportMenu title={firstDoc?.title || 'Reply'} markdown={plain} onError={onError} compact />}
          {isLast && !busy && <button type="button" className="act" aria-label="Regenerate" title="Regenerate" onClick={() => actions.regenerate(msg.id)}><Icon name="refresh" size={16} /></button>}
          <span className="msg-model" title={msg.usage ? `${msg.usage.input?.toLocaleString()} tokens in · ${msg.usage.output?.toLocaleString()} out${msg.usage.searches ? ` · ${msg.usage.searches} searches` : ''}` : ''}>
            {modelLabel}
          </span>
        </div>
      )}
    </div>
  );
}

export default memo(Message);
