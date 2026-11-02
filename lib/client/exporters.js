'use client';
// Export a Markdown reply or document as Word (.docx), PDF (print dialog) or Markdown.
// The Markdown is first rendered to HTML with the same renderer the chat uses,
// so all three formats match what is on screen.

import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import Markdown from '@/components/Markdown';

const fileSafe = (s) => (s || 'document').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'document';

export function renderToElement(markdown) {
  const el = document.createElement('div');
  const root = createRoot(el);
  flushSync(() => root.render(<Markdown text={markdown} plain />));
  const html = el.innerHTML;
  root.unmount();
  const out = document.createElement('div');
  out.innerHTML = html;
  return out;
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const withTitle = (title, markdown) =>
  !title || /^\s*#\s/.test(markdown) ? markdown : `# ${title}\n\n${markdown}`;

// ---------------- Markdown ----------------
export function exportMarkdown(title, markdown) {
  download(new Blob([withTitle(title, markdown)], { type: 'text/markdown;charset=utf-8' }), `${fileSafe(title)}.md`);
}

// ---------------- PDF (via the browser's print dialog → "Save as PDF") ----------------
const PRINT_CSS = `
  @page { margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font: 11.5pt/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 0; }
  h1 { font-size: 20pt; margin: 0 0 10pt; } h2 { font-size: 15pt; margin: 16pt 0 6pt; } h3 { font-size: 12.5pt; margin: 14pt 0 4pt; }
  h1, h2, h3, h4 { break-after: avoid; line-height: 1.25; }
  p, li { orphans: 3; widows: 3; } p { margin: 0 0 8pt; } ul, ol { margin: 0 0 8pt; padding-left: 20pt; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0 12pt; font-size: 10pt; break-inside: avoid; }
  th, td { border: 1px solid #bbb; padding: 4pt 6pt; text-align: left; vertical-align: top; } th { background: #f1f1f1; }
  pre { background: #f5f5f5; padding: 8pt; border-radius: 4pt; white-space: pre-wrap; font-size: 9.5pt; break-inside: avoid; }
  code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 0.92em; }
  blockquote { margin: 0 0 8pt; padding-left: 10pt; border-left: 3px solid #ccc; color: #444; }
  a { color: #1a56db; text-decoration: none; } img { max-width: 100%; } hr { border: 0; border-top: 1px solid #ccc; margin: 14pt 0; }
  .code-head, button { display: none !important; }
`;

export function exportPDF(title, markdown) {
  const el = renderToElement(withTitle(title, markdown));
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${fileSafe(title)}</title><style>${PRINT_CSS}</style></head><body>${el.innerHTML}</body></html>`;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isIOS) {
    // iOS prints the whole page from an iframe, so use a new tab and its Share → Print.
    const w = window.open('', '_blank');
    if (!w) return false;
    w.document.write(html.replace('</body>', '<script>setTimeout(function(){print()},300)<\/script></body>'));
    w.document.close();
    return true;
  }
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  frame.onload = () => {
    setTimeout(() => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(() => frame.remove(), 60_000);
    }, 50);
  };
  frame.srcdoc = html;
  return true;
}

// ---------------- Word (.docx) ----------------
export async function exportDocx(title, markdown) {
  const d = await import('docx');
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType,
    ExternalHyperlink, BorderStyle, ShadingType, LevelFormat, AlignmentType } = d;
  const root = renderToElement(withTitle(title, markdown));
  const HEADINGS = { H1: HeadingLevel.HEADING_1, H2: HeadingLevel.HEADING_2, H3: HeadingLevel.HEADING_3, H4: HeadingLevel.HEADING_4, H5: HeadingLevel.HEADING_5, H6: HeadingLevel.HEADING_6 };
  let listInstance = 0;

  function inline(node, fmt = {}, out = []) {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) {
        const text = n.textContent.replace(/\s+/g, ' ');
        if (text) out.push(new TextRun({ text, bold: fmt.bold, italics: fmt.italics, strike: fmt.strike,
          font: fmt.code ? 'Consolas' : undefined, size: fmt.code ? 20 : undefined,
          shading: fmt.code ? { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' } : undefined,
          style: fmt.link ? 'Hyperlink' : undefined }));
        continue;
      }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName;
      if (tag === 'UL' || tag === 'OL' || tag === 'PRE' || tag === 'TABLE') continue; // handled as blocks
      if (tag === 'BR') { out.push(new TextRun({ text: '', break: 1 })); continue; }
      if (tag === 'INPUT' && n.type === 'checkbox') { out.push(new TextRun({ text: n.checked ? '☑ ' : '☐ ' })); continue; }
      if (tag === 'IMG') { out.push(new TextRun({ text: n.alt ? `[${n.alt}]` : '[image]', italics: true })); continue; }
      if (tag === 'A' && /^https?:/i.test(n.getAttribute('href') || '')) {
        out.push(new ExternalHyperlink({ link: n.getAttribute('href'), children: inline(n, { ...fmt, link: true }) }));
        continue;
      }
      const next = { ...fmt };
      if (tag === 'STRONG' || tag === 'B') next.bold = true;
      if (tag === 'EM' || tag === 'I') next.italics = true;
      if (tag === 'DEL' || tag === 'S') next.strike = true;
      if (tag === 'CODE') next.code = true;
      inline(n, next, out);
    }
    return out;
  }

  function trimRuns(runs) {
    return runs.length ? runs : [new TextRun('')];
  }

  function blocks(node, ctx = {}) {
    const out = [];
    let loose = [];
    const flushLoose = () => {
      if (loose.length) {
        const holder = document.createElement('span');
        loose.forEach((x) => holder.appendChild(x.cloneNode(true)));
        if (holder.textContent.trim()) out.push(new Paragraph({ children: inline(holder), indent: ctx.indent ? { left: ctx.indent } : undefined, spacing: { after: 120 } }));
        loose = [];
      }
    };
    for (const n of node.childNodes) {
      if (n.nodeType === 3 || (n.nodeType === 1 && /^(STRONG|EM|B|I|A|CODE|SPAN|DEL|S|BR|INPUT)$/.test(n.tagName))) { loose.push(n); continue; }
      if (n.nodeType !== 1) continue;
      flushLoose();
      const tag = n.tagName;
      if (HEADINGS[tag]) {
        out.push(new Paragraph({ heading: HEADINGS[tag], children: inline(n), spacing: { before: 240, after: 120 } }));
      } else if (tag === 'P') {
        out.push(new Paragraph({ children: trimRuns(inline(n)), spacing: { after: 140 }, indent: ctx.indent ? { left: ctx.indent } : undefined,
          ...(ctx.quote ? { border: { left: { style: BorderStyle.SINGLE, size: 12, color: 'BBBBBB', space: 8 } } } : {}) }));
      } else if (tag === 'UL' || tag === 'OL') {
        const level = ctx.level ?? 0;
        const instance = tag === 'OL' ? ++listInstance : 0;
        for (const li of n.children) {
          if (li.tagName !== 'LI') continue;
          const runs = inline(li).concat([...li.children].filter((c) => c.tagName === 'P').flatMap((p, i) => (i ? [new TextRun({ text: '', break: 1 })] : []).concat(inline(p))));
          out.push(new Paragraph({
            children: trimRuns(runs),
            ...(tag === 'OL' ? { numbering: { reference: 'numbers', level: Math.min(level, 5), instance } } : { bullet: { level: Math.min(level, 5) } }),
            spacing: { after: 60 },
          }));
          for (const sub of li.children) if (sub.tagName === 'UL' || sub.tagName === 'OL' || sub.tagName === 'PRE' || sub.tagName === 'TABLE') {
            const wrap = document.createElement('div'); wrap.appendChild(sub.cloneNode(true));
            out.push(...blocks(wrap, { ...ctx, level: level + 1, indent: 720 * (level + 1) }));
          }
        }
      } else if (tag === 'PRE' || (tag === 'DIV' && n.classList.contains('code-block'))) {
        const pre = tag === 'PRE' ? n : n.querySelector('pre');
        const lines = (pre?.textContent || '').replace(/\n$/, '').split('\n');
        lines.forEach((line, i) => out.push(new Paragraph({
          children: [new TextRun({ text: line || ' ', font: 'Consolas', size: 19 })],
          shading: { type: ShadingType.CLEAR, fill: 'F5F5F5', color: 'auto' },
          spacing: { after: i === lines.length - 1 ? 160 : 0 },
          indent: ctx.indent ? { left: ctx.indent } : undefined,
        })));
      } else if (tag === 'BLOCKQUOTE') {
        out.push(...blocks(n, { ...ctx, quote: true, indent: (ctx.indent || 0) + 360 }));
      } else if (tag === 'TABLE' || (tag === 'DIV' && n.classList.contains('table-wrap'))) {
        const table = tag === 'TABLE' ? n : n.querySelector(':scope > table');
        const rows = [...table.querySelectorAll('tr')];
        const cols = Math.max(1, ...rows.map((r) => r.children.length));
        out.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: rows.map((r) => new TableRow({
            tableHeader: r.parentElement.tagName === 'THEAD',
            children: [...r.children].map((c) => new TableCell({
              width: { size: Math.floor(100 / cols), type: WidthType.PERCENTAGE },
              shading: c.tagName === 'TH' ? { type: ShadingType.CLEAR, fill: 'F1F1F1', color: 'auto' } : undefined,
              children: [new Paragraph({ children: trimRuns(inline(c, { bold: c.tagName === 'TH' })) })],
            })),
          })),
        }));
        out.push(new Paragraph({ children: [], spacing: { after: 120 } }));
      } else if (tag === 'HR') {
        out.push(new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 1 } }, spacing: { after: 200 } }));
      } else {
        out.push(...blocks(n, ctx));
      }
    }
    flushLoose();
    return out;
  }

  const doc = new Document({
    creator: 'Personal assistant',
    title: title || 'Document',
    styles: {
      default: { document: { run: { font: 'Calibri', size: 22 }, paragraph: { spacing: { line: 276 } } } },
    },
    numbering: {
      config: [{
        reference: 'numbers',
        levels: [0, 1, 2, 3, 4, 5].map((level) => ({
          level,
          format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level % 3],
          text: `%${level + 1}.`,
          alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
        })),
      }],
    },
    sections: [{ children: blocks(root) }],
  });
  const blob = await Packer.toBlob(doc);
  download(blob, `${fileSafe(title)}.docx`);
}
