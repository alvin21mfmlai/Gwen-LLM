'use client';
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Icon } from './icons';
import { useOutside } from './useOutside';
import { api, uid } from '@/lib/client/api';
import { prepareImage } from '@/lib/client/images';
import { IMAGE_SIZES, IMAGE_QUALITIES } from '@/lib/models';

const ACCEPT = 'image/*,application/pdf,.pdf,.docx,.txt,.md,.csv,.tsv,.json,.xml,.html,.htm,.py,.js,.ts,.sql,.yaml,.yml,.log';
const MAX_FILES = 10;

const fmtSize = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

const Composer = forwardRef(function Composer({ busy, onSend, onStop, imageEnabled, onError, placeholder, centered }, ref) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]); // { key, name, size, kind, status: 'uploading'|'ready'|'error', att, preview }
  const [tool, setTool] = useState(null); // null | 'search' | 'image'
  const [size, setSize] = useState('auto');
  const [quality, setQuality] = useState('auto');
  const [menu, setMenu] = useState(false);
  const taRef = useRef(null);
  const fileRef = useRef(null);
  const menuRef = useRef(null);
  const closeMenu = useCallback(() => setMenu(false), []);
  useOutside(menuRef, menu, closeMenu);

  // grow the textarea with its content
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 240) + 'px';
  }, [text]);

  // revoke object URLs on unmount
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => () => filesRef.current.forEach((f) => f.preview?.startsWith('blob:') && URL.revokeObjectURL(f.preview)), []);

  const addFiles = useCallback(async (list) => {
    const incoming = [...list].slice(0, Math.max(0, MAX_FILES - filesRef.current.length));
    if (list.length > incoming.length) onError?.(`You can attach up to ${MAX_FILES} files at once.`);
    for (const raw of incoming) {
      const key = uid();
      const isImage = raw.type.startsWith('image/');
      setFiles((f) => [...f, { key, name: raw.name, size: raw.size, kind: isImage ? 'image' : 'file', status: 'uploading', preview: isImage ? URL.createObjectURL(raw) : null }]);
      try {
        const file = isImage ? await prepareImage(raw) : raw;
        if (file.size > 4 * 1024 * 1024) throw new Error(`“${raw.name}” is larger than 4 MB.`);
        const { attachment } = await api.upload(file);
        setFiles((f) => f.map((x) => (x.key === key ? { ...x, status: 'ready', att: attachment, kind: attachment.kind } : x)));
      } catch (e) {
        setFiles((f) => f.filter((x) => x.key !== key));
        onError?.(e.message || `Could not upload ${raw.name}.`);
      }
    }
  }, [onError]);

  useImperativeHandle(ref, () => ({
    addFiles,
    focus: () => taRef.current?.focus(),
    setText: (t) => { setText(t); setTimeout(() => { const ta = taRef.current; if (ta) { ta.focus(); ta.setSelectionRange(t.length, t.length); } }, 0); },
    attachExisting: (att, withTool) => {
      setFiles((f) => [...f.filter((x) => x.att?.id !== att.id), { key: uid(), name: att.name, size: att.size, kind: att.kind, status: 'ready', att, preview: `/api/files/${att.id}` }]);
      if (withTool) setTool(withTool);
      setTimeout(() => taRef.current?.focus(), 0);
    },
  }), [addFiles]);

  const uploading = files.some((f) => f.status === 'uploading');
  const canSend = !busy && !uploading && (text.trim() || (files.length && tool !== 'image'));

  function submit(e) {
    e?.preventDefault();
    if (!canSend) return;
    if (tool === 'image' && !text.trim()) return;
    onSend({
      text: text.trim(),
      attachments: files.filter((f) => f.att).map((f) => f.att),
      tool,
      imageOptions: { size, quality },
    });
    files.forEach((f) => f.preview?.startsWith('blob:') && URL.revokeObjectURL(f.preview));
    setText('');
    setFiles([]); // the chosen tool stays on for follow-up messages
  }

  function onKeyDown(e) {
    const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
    if (e.key === 'Enter' && !e.shiftKey && !touch && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  function onPaste(e) {
    const items = [...(e.clipboardData?.files || [])];
    if (items.length) { e.preventDefault(); addFiles(items); }
  }

  const ph = tool === 'image' ? (files.some((f) => f.kind === 'image') ? 'Describe how to change the image' : 'Describe the image you want')
    : tool === 'search' ? 'Search the web for…' : placeholder || 'Ask anything';

  return (
    <form className={`composer${centered ? ' centered' : ''}`} onSubmit={submit}>
      {files.length > 0 && (
        <div className="attach-row">
          {files.map((f) => (
            <div key={f.key} className={`attach ${f.kind === 'image' ? 'attach-img' : 'attach-file'}${f.status === 'uploading' ? ' uploading' : ''}`}>
              {f.kind === 'image' && f.preview ? <img src={f.preview} alt="" /> : (
                <>
                  <span className="attach-icon"><Icon name={f.kind === 'pdf' ? 'doc' : 'file'} size={18} /></span>
                  <span className="attach-meta"><span className="attach-name">{f.name}</span><span className="attach-size">{f.status === 'uploading' ? 'Uploading…' : fmtSize(f.size)}</span></span>
                </>
              )}
              {f.status === 'uploading' && f.kind === 'image' && <span className="spinner small" />}
              <button type="button" className="attach-x" aria-label={`Remove ${f.name}`}
                onClick={() => setFiles((all) => all.filter((x) => x.key !== f.key))}><Icon name="x" size={12} strokeWidth={3} /></button>
            </div>
          ))}
        </div>
      )}
      <textarea ref={taRef} rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown} onPaste={onPaste}
        placeholder={ph} aria-label="Message" />
      <div className="composer-bar">
        <div className="composer-left" ref={menuRef}>
          <button type="button" className="icon-btn round" aria-label="Add files and tools" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            <Icon name="plus" size={20} />
          </button>
          {menu && (
            <div className="menu tools-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => { setMenu(false); fileRef.current?.click(); }}>
                <Icon name="clip" size={18} /> Add photos &amp; files
              </button>
              {imageEnabled && (
                <button type="button" role="menuitem" className={tool === 'image' ? 'on' : ''} onClick={() => { setMenu(false); setTool(tool === 'image' ? null : 'image'); taRef.current?.focus(); }}>
                  <Icon name="brush" size={18} /> Create image {tool === 'image' && <Icon name="check" size={16} className="menu-check" />}
                </button>
              )}
              <button type="button" role="menuitem" className={tool === 'search' ? 'on' : ''} onClick={() => { setMenu(false); setTool(tool === 'search' ? null : 'search'); taRef.current?.focus(); }}>
                <Icon name="globe" size={18} /> Search the web {tool === 'search' && <Icon name="check" size={16} className="menu-check" />}
              </button>
            </div>
          )}
          {tool && (
            <span className="tool-chip">
              <Icon name={tool === 'image' ? 'brush' : 'globe'} size={15} />
              {tool === 'image' ? 'Image' : 'Search'}
              <button type="button" aria-label="Turn off tool" onClick={() => setTool(null)}><Icon name="x" size={13} /></button>
            </span>
          )}
          {tool === 'image' && (
            <>
              <select className="mini-select" value={size} onChange={(e) => setSize(e.target.value)} aria-label="Image shape">
                {IMAGE_SIZES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <select className="mini-select" value={quality} onChange={(e) => setQuality(e.target.value)} aria-label="Image quality">
                {IMAGE_QUALITIES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </>
          )}
        </div>
        {busy ? (
          <button type="button" className="send-btn" onClick={onStop} aria-label="Stop"><Icon name="stop" size={16} /></button>
        ) : (
          <button type="submit" className="send-btn" disabled={!canSend || (tool === 'image' && !text.trim())} aria-label="Send">
            <Icon name="send" size={18} strokeWidth={2.4} />
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" multiple accept={ACCEPT} hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
    </form>
  );
});

export default Composer;
