'use client';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import Sidebar from './Sidebar';
import ModelPicker from './ModelPicker';
import Composer from './Composer';
import Message from './Message';
import DocumentPanel from './DocumentPanel';
import SettingsModal from './SettingsModal';
import { Icon } from './icons';
import { api, streamChat, uid } from '@/lib/client/api';
import { splitDocuments, replaceDocument } from '@/lib/client/segments';

const SUGGESTIONS = [
  { label: 'Write an email', prompt: 'Help me write a polite email to ' },
  { label: 'Summarise a file', prompt: 'Summarise the attached file in a few bullet points.' },
  { label: 'Plan meals', prompt: 'Plan a week of simple, healthy family dinners with a shopping list.' },
  { label: 'Explain something', prompt: 'Explain in simple terms: ' },
];

function greeting(name) {
  const h = new Date().getHours();
  const part = h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return name ? `${part}, ${name}` : 'What can I help with?';
}

/** Strips UI-only fields before a chat is saved. */
function forStorage(messages) {
  return messages
    .filter((m) => !(m.pending && !m.content && !m.images?.length))
    .map(({ pending, status, ...m }) => m);
}

/** Minimal message shape for the /api/chat request. */
const forApi = (m) => ({
  role: m.role,
  content: m.content || '',
  attachments: (m.attachments || []).map((a) => ({ id: a.id })),
  images: (m.images || []).map((i) => ({ id: i.id })),
  imagePrompt: m.imagePrompt,
  error: m.error && !m.content ? true : undefined,
});

export default function App({ boot: initialBoot, initialChatId }) {
  const [boot, setBoot] = useState(initialBoot);
  const [list, setList] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [activeId, setActiveId] = useState(initialChatId || null);
  const [model, setModel] = useState(initialBoot.defaultModel);
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [doc, setDoc] = useState(null); // { chatId, msgId, index }
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [theme, setTheme] = useState('system');
  const [dragging, setDragging] = useState(false);
  const [loadingChat, setLoadingChat] = useState(false);

  const chats = useRef({});          // id → chat (source of truth for message content)
  const streams = useRef({});        // id → AbortController
  const saves = useRef({});          // id → promise chain (serialises saves)
  const autoOpened = useRef(new Set());
  const composer = useRef(null);
  const scroller = useRef(null);
  const stick = useRef(true);
  const [, force] = useReducer((x) => x + 1, 0);

  const showError = useCallback((msg) => {
    setToast({ msg, id: Date.now() });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  // ---------- theme ----------
  useEffect(() => {
    try { setTheme(localStorage.getItem('plc-theme') || 'system'); setCollapsed(localStorage.getItem('plc-collapsed') === '1'); } catch {}
  }, []);
  useEffect(() => {
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  const changeTheme = (t) => { setTheme(t); try { localStorage.setItem('plc-theme', t); } catch {} };
  const toggleCollapsed = () => setCollapsed((c) => { try { localStorage.setItem('plc-collapsed', c ? '0' : '1'); } catch {} return !c; });

  // ---------- chat cache helpers ----------
  const updateChat = useCallback((id, fn) => {
    const next = fn(chats.current[id]);
    chats.current = { ...chats.current, [id]: next };
    force();
    return next;
  }, []);
  const patchMsg = useCallback((chatId, msgId, patch) => {
    updateChat(chatId, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === msgId ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)) }));
  }, [updateChat]);

  const touchList = useCallback((id, fields) => {
    setList((l) => {
      const existing = l.find((c) => c.id === id);
      const item = { ...(existing || { id, title: 'New chat' }), ...fields };
      return [item, ...l.filter((c) => c.id !== id)];
    });
  }, []);

  const persist = useCallback((id) => {
    const run = async () => {
      const c = chats.current[id];
      if (!c || !c.messages.length) return;
      try {
        await api.send(`/api/chats/${id}`, 'PUT', { title: c.title, model: c.model, messages: forStorage(c.messages) });
      } catch (e) {
        showError(`Could not save this chat: ${e.message}`);
      }
    };
    saves.current[id] = (saves.current[id] || Promise.resolve()).then(run);
    return saves.current[id];
  }, [showError]);

  // ---------- load sidebar ----------
  useEffect(() => {
    api.get('/api/chats').then((d) => setList(d.chats)).catch((e) => showError(e.message)).finally(() => setListLoading(false));
  }, [showError]);

  // ---------- load the active chat ----------
  useEffect(() => {
    if (!activeId || chats.current[activeId]) {
      if (activeId && chats.current[activeId]?.model && boot.models.some((m) => m.id === chats.current[activeId].model)) setModel(chats.current[activeId].model);
      return;
    }
    let cancelled = false;
    setLoadingChat(true);
    api.get(`/api/chats/${activeId}`)
      .then(({ chat }) => {
        if (cancelled) return;
        chats.current = { ...chats.current, [chat.id]: chat };
        if (chat.model && boot.models.some((m) => m.id === chat.model)) setModel(chat.model);
        stick.current = true;
        force();
      })
      .catch((e) => {
        if (cancelled) return;
        if (e.status === 404) setActiveId(null);
        else showError(e.message);
      })
      .finally(() => !cancelled && setLoadingChat(false));
    return () => { cancelled = true; };
  }, [activeId, boot.models, showError]);

  // ---------- URL ----------
  useEffect(() => {
    const path = activeId ? `/c/${activeId}` : '/';
    if (window.location.pathname !== path) window.history.pushState({}, '', path);
    const title = activeId ? chats.current[activeId]?.title : null;
    document.title = title && title !== 'New chat' ? `${title} · ${boot.appName}` : boot.appName;
  });
  useEffect(() => {
    const onPop = () => {
      const m = /^\/c\/([\w-]+)/.exec(window.location.pathname);
      setActiveId(m ? m[1] : null);
      setDoc(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // ---------- titles ----------
  const maybeTitle = useCallback(async (chatId) => {
    const c = chats.current[chatId];
    if (!c || (c.title && c.title !== 'New chat')) return;
    const firstUser = c.messages.find((m) => m.role === 'user');
    const firstAsst = c.messages.find((m) => m.role === 'assistant' && (m.content || m.images?.length));
    if (!firstUser || !firstAsst) return;
    try {
      const { title } = await api.send('/api/title', 'POST', {
        user: firstUser.content || (firstUser.attachments || []).map((a) => a.name).join(', '),
        assistant: firstAsst.content || `(image for: ${firstAsst.imagePrompt || ''})`,
      });
      updateChat(chatId, (x) => ({ ...x, title }));
      touchList(chatId, { title });
      await saves.current[chatId];
      await api.send(`/api/chats/${chatId}`, 'PATCH', { title });
    } catch {}
  }, [updateChat, touchList]);

  // ---------- running the model ----------
  const runChat = useCallback(async (chatId, base, { webSearch }) => {
    const modelId = model;
    const asst = { id: uid(), role: 'assistant', content: '', model: modelId, pending: true, status: webSearch ? 'Searching the web…' : '', sources: [], webSearch, createdAt: Date.now() };
    updateChat(chatId, (c) => ({ ...c, model: modelId, messages: [...base, asst] }));
    touchList(chatId, { updatedAt: Date.now() });
    stick.current = true;
    persist(chatId);

    const ctrl = new AbortController();
    streams.current[chatId] = ctrl;
    force();

    let text = '';
    let timer = null;
    let error = null;
    let stopped = false;
    const flush = () => {
      timer = null;
      patchMsg(chatId, asst.id, { content: text });
      if (!autoOpened.current.has(asst.id) && /<document\b[^>]*>/.test(text) && window.innerWidth >= 1100) {
        autoOpened.current.add(asst.id);
        const parts = splitDocuments(text).filter((p) => p.type === 'doc');
        if (parts.length) setDoc((d) => d || { chatId, msgId: asst.id, index: 0 });
      }
    };
    try {
      await streamChat(
        { model: modelId, messages: base.map(forApi), webSearch, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
        {
          signal: ctrl.signal,
          onEvent: (ev) => {
            if (ev.t === 'text') {
              text += ev.v;
              if (!timer) timer = setTimeout(flush, 40);
            } else if (ev.t === 'status') patchMsg(chatId, asst.id, { status: ev.v });
            else if (ev.t === 'sources') patchMsg(chatId, asst.id, { sources: ev.v });
            else if (ev.t === 'usage') patchMsg(chatId, asst.id, { usage: ev.v });
            else if (ev.t === 'error') error = ev.v;
          },
        },
      );
    } catch (e) {
      if (e.name === 'AbortError') stopped = true;
      else error = e.message || 'Connection lost.';
    }
    clearTimeout(timer);
    patchMsg(chatId, asst.id, { content: text, pending: false, status: '', error: error || undefined, stopped: stopped || undefined });
    delete streams.current[chatId];
    force();
    await persist(chatId);
    if (!error) maybeTitle(chatId);
  }, [model, updateChat, patchMsg, persist, touchList, maybeTitle]);

  const runImage = useCallback(async (chatId, base, { prompt, sourceIds, size, quality }) => {
    const asst = { id: uid(), role: 'assistant', kind: 'image', content: '', imagePrompt: prompt, model: boot.imageModel, pending: true, createdAt: Date.now() };
    updateChat(chatId, (c) => ({ ...c, messages: [...base, asst] }));
    touchList(chatId, { updatedAt: Date.now() });
    stick.current = true;
    persist(chatId);
    const ctrl = new AbortController();
    streams.current[chatId] = ctrl;
    force();
    try {
      const res = await fetch('/api/image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({ prompt, sourceIds, size, quality }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (!res.ok) throw new Error(data.error || `Image request failed (${res.status})`);
      patchMsg(chatId, asst.id, { images: [data.image], model: data.model, revisedPrompt: data.revisedPrompt || undefined, pending: false });
    } catch (e) {
      patchMsg(chatId, asst.id, e.name === 'AbortError' ? { pending: false, stopped: true } : { pending: false, error: e.message });
    }
    delete streams.current[chatId];
    force();
    await persist(chatId);
    maybeTitle(chatId);
  }, [boot.imageModel, updateChat, patchMsg, persist, touchList, maybeTitle]);

  // ---------- user actions ----------
  const send = useCallback(({ text, attachments, tool, imageOptions }) => {
    if (!boot.models.length && tool !== 'image') { showError('No AI models are set up. Add an API key in Vercel.'); return; }
    const chatId = activeId || uid();
    if (!chats.current[chatId]) chats.current = { ...chats.current, [chatId]: { id: chatId, title: 'New chat', messages: [], createdAt: Date.now() } };
    if (!activeId) setActiveId(chatId);
    const userMsg = { id: uid(), role: 'user', content: text, attachments, createdAt: Date.now() };
    const base = [...chats.current[chatId].messages, userMsg];
    setDrawer(false);
    if (tool === 'image') {
      runImage(chatId, base, { prompt: text, sourceIds: attachments.filter((a) => a.kind === 'image').map((a) => a.id), ...imageOptions });
    } else {
      runChat(chatId, base, { webSearch: tool === 'search' });
    }
  }, [activeId, boot.models.length, runChat, runImage, showError]);

  const regenerate = useCallback((msgId) => {
    const chatId = activeId;
    const c = chats.current[chatId];
    if (!c || streams.current[chatId]) return;
    const idx = c.messages.findIndex((m) => m.id === msgId);
    if (idx < 1) return;
    const msg = c.messages[idx];
    const base = c.messages.slice(0, idx);
    const lastUser = base[base.length - 1];
    if (msg.kind === 'image') {
      runImage(chatId, base, { prompt: msg.imagePrompt || lastUser?.content || '', sourceIds: (lastUser?.attachments || []).filter((a) => a.kind === 'image').map((a) => a.id) });
    } else {
      runChat(chatId, base, { webSearch: !!msg.webSearch });
    }
  }, [activeId, runChat, runImage]);

  const editUser = useCallback((msgId, newText) => {
    const chatId = activeId;
    const c = chats.current[chatId];
    if (!c || streams.current[chatId]) return;
    const idx = c.messages.findIndex((m) => m.id === msgId);
    if (idx < 0) return;
    const next = c.messages[idx + 1];
    const base = [...c.messages.slice(0, idx), { ...c.messages[idx], content: newText }];
    if (next?.kind === 'image') runImage(chatId, base, { prompt: newText, sourceIds: (c.messages[idx].attachments || []).filter((a) => a.kind === 'image').map((a) => a.id) });
    else runChat(chatId, base, { webSearch: !!next?.webSearch });
  }, [activeId, runChat, runImage]);

  const stop = useCallback(() => { streams.current[activeId]?.abort(); }, [activeId]);

  const newChat = useCallback(() => {
    setActiveId(null);
    setDoc(null);
    setDrawer(false);
    setTimeout(() => composer.current?.focus(), 0);
  }, []);

  const openChat = useCallback((id) => {
    setActiveId(id);
    setDoc(null);
    setDrawer(false);
    stick.current = true;
  }, []);

  const renameChat = useCallback(async (id, title) => {
    setList((l) => l.map((c) => (c.id === id ? { ...c, title } : c)));
    if (chats.current[id]) updateChat(id, (c) => ({ ...c, title }));
    try { await api.send(`/api/chats/${id}`, 'PATCH', { title }); } catch (e) { showError(e.message); }
  }, [updateChat, showError]);

  const deleteChat = useCallback(async (id) => {
    streams.current[id]?.abort();
    setList((l) => l.filter((c) => c.id !== id));
    const { [id]: _, ...rest } = chats.current;
    chats.current = rest;
    if (id === activeId) newChat();
    try { await api.send(`/api/chats/${id}`, 'DELETE'); } catch (e) { showError(e.message); }
  }, [activeId, newChat, showError]);

  const saveDoc = useCallback((body, title) => {
    if (!doc) return;
    patchMsg(doc.chatId, doc.msgId, (m) => ({ content: replaceDocument(m.content, doc.index, body, title) }));
    persist(doc.chatId);
  }, [doc, patchMsg, persist]);

  // Stable action object for messages (keeps Message memoisation effective).
  const actionsRef = useRef({});
  actionsRef.current = {
    regenerate,
    edit: editUser,
    error: showError,
    openDoc: (msgId, index) => setDoc({ chatId: activeId, msgId, index }),
    editImage: (img) => composer.current?.attachExisting({ ...img, kind: 'image' }, 'image'),
  };
  const actions = useMemo(() => ({
    regenerate: (...a) => actionsRef.current.regenerate(...a),
    edit: (...a) => actionsRef.current.edit(...a),
    error: (...a) => actionsRef.current.error(...a),
    openDoc: (...a) => actionsRef.current.openDoc(...a),
    editImage: (...a) => actionsRef.current.editImage(...a),
  }), []);

  // ---------- derived ----------
  const chat = activeId ? chats.current[activeId] : null;
  const messages = chat?.messages || [];
  const busy = !!(activeId && streams.current[activeId]);
  const busyIds = Object.keys(streams.current);
  const modelLabel = (id) => boot.models.find((m) => m.id === id)?.label || id || '';
  const empty = !activeId || (!messages.length && !loadingChat);

  let docView = null;
  if (doc) {
    const m = chats.current[doc.chatId]?.messages.find((x) => x.id === doc.msgId);
    const part = m ? splitDocuments(m.content || '').filter((p) => p.type === 'doc')[doc.index] : null;
    if (part && doc.chatId === activeId) docView = { ...part, key: `${doc.msgId}:${doc.index}`, streaming: !!m.pending };
  }

  // ---------- auto-scroll ----------
  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  });
  const onScroll = () => {
    const el = scroller.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // ---------- drag & drop ----------
  const dragDepth = useRef(0);
  const onDragEnter = (e) => { if ([...e.dataTransfer.types].includes('Files')) { dragDepth.current++; setDragging(true); } };
  const onDragLeave = () => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); };
  const onDrop = (e) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (e.dataTransfer.files?.length) composer.current?.addFiles(e.dataTransfer.files);
  };

  const warnings = [];
  if (boot.production && boot.storage === 'memory') warnings.push('Chat storage is not connected, so chats will not be kept. Connect Upstash Redis in your Vercel project (see README).');
  if (!boot.models.length) warnings.push('No AI provider is set up. Add ANTHROPIC_API_KEY and/or OPENAI_API_KEY in Vercel, then redeploy.');

  const composerEl = (
    <Composer ref={composer} busy={busy} onSend={send} onStop={stop} imageEnabled={!!boot.imageModel} onError={showError} centered={empty} />
  );
  const displayName = boot.settings.displayName || boot.user?.name || '';

  return (
    <div className={`app${collapsed ? ' collapsed' : ''}${drawer ? ' drawer-open' : ''}${docView ? ' with-doc' : ''}`}>
      <div className="sidebar">
        <Sidebar appName={boot.appName} chats={list} activeId={activeId} busyIds={busyIds} loading={listLoading}
          onNew={newChat} onOpen={openChat} onRename={renameChat} onDelete={deleteChat}
          onSettings={() => { setSettingsOpen(true); setDrawer(false); }}
          onCollapse={() => (window.innerWidth < 768 ? setDrawer(false) : toggleCollapsed())} userName={displayName} />
      </div>
      {drawer && <div className="scrim" onClick={() => setDrawer(false)} aria-hidden="true" />}

      <main className="main" onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
        <header className="topbar">
          <button type="button" className="icon-btn show-mobile" onClick={() => setDrawer(true)} aria-label="Open chats"><Icon name="menu" size={22} /></button>
          {collapsed && (
            <span className="show-desktop topbar-tools">
              <button type="button" className="icon-btn" onClick={toggleCollapsed} aria-label="Open sidebar" title="Open sidebar"><Icon name="sidebar" size={20} /></button>
              <button type="button" className="icon-btn" onClick={newChat} aria-label="New chat" title="New chat"><Icon name="newchat" size={20} /></button>
            </span>
          )}
          <ModelPicker models={boot.models} value={model} onChange={setModel} />
          <span className="spacer" />
          <button type="button" className="icon-btn show-mobile" onClick={newChat} aria-label="New chat"><Icon name="newchat" size={20} /></button>
        </header>

        {warnings.map((w) => <div key={w} className="banner" role="status">{w}</div>)}

        <div className={`stage${empty ? ' is-empty' : ''}`}>
          {empty ? (
            <div className="welcome"><h1>{greeting(displayName)}</h1></div>
          ) : (
            <div className="thread" ref={scroller} onScroll={onScroll}>
              <div className="thread-inner">
                {loadingChat && !messages.length && <div className="thread-loading"><span className="spinner" /></div>}
                {messages.map((m, i) => (
                  <Message key={m.id} msg={m} isLast={i === messages.length - 1} busy={busy} actions={actions} modelLabel={modelLabel(m.model)} />
                ))}
              </div>
            </div>
          )}
          <div className="composer-dock">
            {composerEl}
            {empty ? (
              <div className="suggestions">
                {SUGGESTIONS.map((s) => (
                  <button type="button" key={s.label} className="suggestion" onClick={() => composer.current?.setText(s.prompt)}>{s.label}</button>
                ))}
              </div>
            ) : (
              <p className="disclaimer">AI can make mistakes. Check important information.</p>
            )}
          </div>
        </div>
        {dragging && <div className="drop-overlay"><div><Icon name="clip" size={28} /><p>Drop files to attach</p></div></div>}
      </main>

      {docView && (
        <DocumentPanel doc={docView} streaming={docView.streaming} onClose={() => setDoc(null)} onSave={saveDoc} onError={showError} />
      )}

      {settingsOpen && (
        <SettingsModal boot={boot} theme={theme} onTheme={changeTheme} onClose={() => setSettingsOpen(false)} onError={showError}
          onSaved={(settings) => setBoot((b) => ({ ...b, settings, defaultModel: settings.defaultModel || b.defaultModel }))} />
      )}

      {toast && (
        <div className="toast" role="alert" key={toast.id}>
          <span>{toast.msg}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss"><Icon name="x" size={16} /></button>
        </div>
      )}
    </div>
  );
}
