'use client';
import { useRef, useState, useCallback } from 'react';
import { Icon } from './icons';
import { useOutside } from './useOutside';
import { PROVIDER_NAMES } from '@/lib/models';

export default function ModelPicker({ models, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useOutside(ref, open, close);
  const current = models.find((m) => m.id === value);
  const providers = [...new Set(models.map((m) => m.provider))];

  if (!models.length) return <div className="model-btn muted">No models: add an API key</div>;
  return (
    <div className="model-picker" ref={ref}>
      <button type="button" className="model-btn" onClick={() => setOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={open}>
        <span>{current?.label || 'Choose a model'}</span>
        <Icon name="chevron" size={16} />
      </button>
      {open && (
        <div className="menu model-menu" role="listbox" aria-label="Model">
          {providers.map((p) => (
            <div key={p} className="model-group">
              <div className="model-group-label">{PROVIDER_NAMES[p] || p}</div>
              {models.filter((m) => m.provider === p).map((m) => (
                <button type="button" key={m.id} role="option" aria-selected={m.id === value}
                  className={`model-opt${m.id === value ? ' selected' : ''}`} onClick={() => { onChange(m.id); setOpen(false); }}>
                  <span className="model-opt-text">
                    <span className="model-opt-name">{m.label}</span>
                    {m.description && <span className="model-opt-desc">{m.description}</span>}
                  </span>
                  {m.id === value && <Icon name="check" size={18} />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
