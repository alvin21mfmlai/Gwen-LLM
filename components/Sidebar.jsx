'use client';
import { useMemo, useRef, useState, useCallback } from 'react';
import { Icon } from './icons';
import { useOutside } from './useOutside';

function groupLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'Previous 7 days';
  if (days < 30) return 'Previous 30 days';
  return d.toLocaleDateString(undefined, { month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

function ChatItem({ chat, active, busy, onOpen, onRename, onDelete }) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [title, setTitle] = useState(chat.title);
  const ref = useRef(null);
  const close = useCallback(() => { setMenu(false); setConfirm(false); }, []);
  useOutside(ref, menu, close);

  if (editing) {
    return (
      <form className="chat-item editing" onSubmit={(e) => { e.preventDefault(); setEditing(false); if (title.trim() && title !== chat.title) onRename(title.trim()); }}>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={(e) => e.currentTarget.form.requestSubmit()}
          onKeyDown={(e) => { if (e.key === 'Escape') { setTitle(chat.title); setEditing(false); } }} aria-label="Chat name" maxLength={120} />
      </form>
    );
  }
  return (
    <div className={`chat-item${active ? ' active' : ''}${menu ? ' menu-open' : ''}`} ref={ref}>
      <button type="button" className="chat-link" onClick={onOpen} title={chat.title}>
        <span className="chat-title">{chat.title}</span>
        {busy && <span className="dot-pulse" aria-label="Answering" />}
      </button>
      <button type="button" className="chat-more" aria-label={`Options for ${chat.title}`} onClick={() => setMenu((v) => !v)}>
        <Icon name="more" size={18} />
      </button>
      {menu && (
        <div className="menu chat-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { setMenu(false); setTitle(chat.title); setEditing(true); }}>
            <Icon name="pen" size={16} /> Rename
          </button>
          <button type="button" role="menuitem" className="danger" onClick={() => (confirm ? (close(), onDelete()) : setConfirm(true))}>
            <Icon name="trash" size={16} /> {confirm ? 'Tap again to delete' : 'Delete'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ appName, chats, activeId, busyIds, onNew, onOpen, onRename, onDelete, onSettings, onCollapse, userName, loading }) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const filtered = q.trim() ? chats.filter((c) => c.title.toLowerCase().includes(q.trim().toLowerCase())) : chats;
    const out = [];
    for (const c of filtered) {
      const label = groupLabel(c.updatedAt || Date.now());
      let g = out.find((x) => x.label === label);
      if (!g) out.push((g = { label, items: [] }));
      g.items.push(c);
    }
    return out;
  }, [chats, q]);

  return (
    <nav className="sidebar-inner" aria-label="Chats">
      <div className="side-top">
        <button type="button" className="icon-btn" onClick={onCollapse} aria-label="Close sidebar" title="Close sidebar">
          <Icon name="sidebar" size={20} />
        </button>
        <span className="side-app">{appName}</span>
        <button type="button" className="icon-btn" onClick={onNew} aria-label="New chat" title="New chat">
          <Icon name="newchat" size={20} />
        </button>
      </div>
      <button type="button" className="new-chat" onClick={onNew}>
        <Icon name="newchat" size={18} /> New chat
      </button>
      <label className="side-search">
        <Icon name="search" size={16} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" aria-label="Search chats" />
        {q && <button type="button" onClick={() => setQ('')} aria-label="Clear search"><Icon name="x" size={14} /></button>}
      </label>
      <div className="chat-list">
        {loading && <div className="side-empty">Loading…</div>}
        {!loading && !groups.length && <div className="side-empty">{q ? 'No chats match.' : 'Your chats will appear here.'}</div>}
        {groups.map((g) => (
          <section key={g.label}>
            <h3>{g.label}</h3>
            {g.items.map((c) => (
              <ChatItem key={c.id} chat={c} active={c.id === activeId} busy={busyIds.includes(c.id)}
                onOpen={() => onOpen(c.id)} onRename={(t) => onRename(c.id, t)} onDelete={() => onDelete(c.id)} />
            ))}
          </section>
        ))}
      </div>
      <button type="button" className="side-user" onClick={onSettings}>
        <span className="avatar">{(userName || appName || '?').trim().charAt(0).toUpperCase()}</span>
        <span className="side-user-name">{userName || 'Settings'}</span>
        <Icon name="settings" size={18} />
      </button>
    </nav>
  );
}
