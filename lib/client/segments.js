// Splits an assistant reply into plain text and <document title="…">…</document> parts.
// Works on partial text while a reply is still streaming.

const OPEN = '<document';
const CLOSE = '</document>';

/** Removes a dangling, half-streamed tag fragment such as "<docu" or "</documen" from the end. */
function trimPartialTag(s, tag) {
  for (let n = Math.min(tag.length - 1, s.length); n > 0; n--) {
    if (s.endsWith(tag.slice(0, n))) return s.slice(0, -n);
  }
  return s;
}

export function splitDocuments(text) {
  const parts = [];
  const re = /<document\b([^>]*)>([\s\S]*?)(<\/document>|$)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text || ''))) {
    if (m.index > last) parts.push({ type: 'text', text: text.slice(last, m.index) });
    const title = (/title\s*=\s*"([^"]*)"/.exec(m[1]) || /title\s*=\s*'([^']*)'/.exec(m[1]) || [])[1] || 'Document';
    const complete = m[3] === CLOSE;
    let body = m[2].replace(/^\s*\n/, '');
    if (!complete) body = trimPartialTag(body, CLOSE);
    parts.push({ type: 'doc', title: title.trim() || 'Document', body: body.replace(/\s+$/, ''), complete, index: parts.filter((p) => p.type === 'doc').length });
    last = re.lastIndex;
    if (!complete) break;
  }
  if (last < (text || '').length) {
    // An opening tag that has not finished streaming yet ("<document titl").
    let rest = text.slice(last);
    const open = rest.lastIndexOf('<');
    if (open >= 0) {
      const tail = rest.slice(open);
      if (!tail.includes('>') && (OPEN.startsWith(tail) || tail.startsWith(OPEN))) rest = rest.slice(0, open);
    }
    parts.push({ type: 'text', text: rest });
  }
  return parts.filter((p) => p.type === 'doc' || p.text.trim());
}

/** Replaces the body of the nth document in a reply (used when she edits a document). */
export function replaceDocument(text, index, newBody, newTitle) {
  let i = -1;
  return text.replace(/<document\b([^>]*)>([\s\S]*?)(<\/document>|$)/g, (all, attrs, body, close) => {
    i++;
    if (i !== index) return all;
    const title = newTitle ?? ((/title\s*=\s*"([^"]*)"/.exec(attrs) || [])[1] || 'Document');
    return `<document title="${title.replace(/"/g, "'")}">\n${newBody}\n${close || CLOSE}`;
  });
}

/** Plain Markdown for copying: document tags become a heading + body. */
export function toPlainMarkdown(text) {
  return splitDocuments(text)
    .map((p) => (p.type === 'doc' ? (p.body.trimStart().startsWith('#') ? p.body : `# ${p.title}\n\n${p.body}`) : p.text.trim()))
    .join('\n\n');
}
