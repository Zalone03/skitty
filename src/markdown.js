// ============================================================================
// Markdown simples e seguro para as notas dos cartoes.
// Todo o texto e escapado antes; so as tags geradas aqui entram no HTML.
// ============================================================================

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function safeUrl(raw) {
  const url = String(raw).trim().replace(/&amp;/g, "&");
  if (/^(https?:\/\/|mailto:)/i.test(url)) return url;
  if (/^www\./i.test(url)) return `https://${url}`;
  return null;
}

const linkTag = (url, text) => `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${text}</a>`;

function inline(text) {
  const codes = [];
  let s = String(text).replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => {
    const url = safeUrl(u);
    return url ? linkTag(url, t) : m;
  });
  s = s.replace(/(^|[\s(])((?:https?:\/\/|www\.)[^\s<)]+)/g, (m, pre, u) => {
    const url = safeUrl(u);
    return url ? `${pre}${linkTag(url, u)}` : m;
  });
  s = s.replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/~~(?=\S)(.+?)(?<=\S)~~/g, "<del>$1</del>");
  s = s.replace(/==(?=\S)(.+?)(?<=\S)==/g, "<mark>$1</mark>");
  s = s.replace(/(^|[^*\w])\*(?=\S)(.+?)(?<=\S)\*(?!\w)/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^_\w])_(?=\S)(.+?)(?<=\S)_(?!\w)/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
}

const indentOf = (space) => Math.min(4, Math.floor(space.replace(/\t/g, "  ").length / 2));

export const normalizeNewlines = (s) => String(s || "").replace(/\r\n?/g, "\n");

/** Converte o texto em HTML seguro. Itens de checklist levam data-line para marcar com um toque. */
export function renderMarkdown(md) {
  const lines = normalizeNewlines(md).split("\n");
  let html = "";
  let list = null;
  let para = [];
  const closeList = () => {
    if (list) html += `</${list}>`;
    list = null;
  };
  const openList = (tag, start) => {
    if (list === tag) return;
    closeList();
    html += tag === "ol" && start && start !== "1" ? `<ol start="${Number(start)}">` : `<${tag}>`;
    list = tag;
  };
  const flush = () => {
    if (para.length) html += `<p>${para.map(inline).join("<br>")}</p>`;
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, "");
    let m;

    if (/^\s*```/.test(line)) {
      flush();
      closeList();
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      html += `<pre><code>${esc(buf.join("\n"))}</code></pre>`;
      continue;
    }
    if (!line.trim()) {
      flush();
      closeList();
      continue;
    }
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      flush();
      closeList();
      html += `<h${m[1].length + 1}>${inline(m[2])}</h${m[1].length + 1}>`;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flush();
      closeList();
      html += "<hr>";
      continue;
    }
    if ((m = line.match(/^>\s?(.*)$/))) {
      flush();
      closeList();
      const buf = [m[1]];
      while (i + 1 < lines.length && (m = lines[i + 1].match(/^>\s?(.*)$/))) {
        buf.push(m[1]);
        i++;
      }
      html += `<blockquote>${buf.map(inline).join("<br>")}</blockquote>`;
      continue;
    }
    if ((m = line.match(/^(\s*)[-*+]\s+\[( |x|X)\]\s*(.*)$/))) {
      flush();
      openList("ul");
      const done = m[2] !== " ";
      html += `<li class="task${done ? " done" : ""}" style="--indent:${indentOf(m[1])}"><input type="checkbox" data-line="${i}"${done ? " checked" : ""} aria-label="Marcar item"><span>${inline(m[3])}</span></li>`;
      continue;
    }
    if ((m = line.match(/^(\s*)[-*+]\s+(.*)$/))) {
      flush();
      openList("ul");
      html += `<li style="--indent:${indentOf(m[1])}">${inline(m[2])}</li>`;
      continue;
    }
    if ((m = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/))) {
      flush();
      openList("ol", m[2]);
      html += `<li style="--indent:${indentOf(m[1])}">${inline(m[3])}</li>`;
      continue;
    }
    closeList();
    para.push(line);
  }
  flush();
  closeList();
  return html;
}

/** Marca ou desmarca o item de checklist da linha indicada. */
export function toggleTaskLine(md, lineIndex) {
  const lines = normalizeNewlines(md).split("\n");
  if (lines[lineIndex] === undefined) return md;
  lines[lineIndex] = lines[lineIndex].replace(/\[( |x|X)\]/, (_, c) => (c === " " ? "[x]" : "[ ]"));
  return lines.join("\n");
}

/** Texto puro (para o resumo no cartao). */
export function plainText(md) {
  return normalizeNewlines(md)
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*[-*+]\s+\[( |x|X)\]\s*/gm, "")
    .replace(/^\s*([-*+]|\d+[.)])\s+/gm, "")
    .replace(/^\s*(-{3,}|\*{3,}|_{3,})\s*$/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/(\*\*|~~|==|`)/g, "")
    .replace(/(^|\s)[*_](\S)/g, "$1$2")
    .replace(/(\S)[*_](\s|$)/g, "$1$2")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Conta itens de checklist escritos nas notas. */
export function noteTasks(md) {
  const all = normalizeNewlines(md).match(/^\s*[-*+]\s+\[( |x|X)\]/gm) || [];
  return { total: all.length, done: all.filter((t) => /\[(x|X)\]/.test(t)).length };
}
