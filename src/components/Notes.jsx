import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { normalizeNewlines, renderMarkdown, toggleTaskLine } from "../markdown.js";
import { Icon } from "./ui.jsx";

const SAVE_DELAY = 500;

// ---------------------------------------------------------------------------
// Operacoes no texto (mantem o desfazer do navegador com insertText)
// ---------------------------------------------------------------------------

function insert(ta, text, selectFrom, selectTo) {
  ta.focus();
  const ok = document.execCommand && document.execCommand("insertText", false, text);
  if (!ok) {
    ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, "end");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }
  if (selectFrom !== undefined) ta.setSelectionRange(selectFrom, selectTo ?? selectFrom);
}

function wrap(ta, before, after = before, placeholder = "texto") {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const sel = value.slice(s, e);
  if (sel && value.slice(s - before.length, s) === before && value.slice(e, e + after.length) === after) {
    ta.setSelectionRange(s - before.length, e + after.length);
    insert(ta, sel, s - before.length, e - before.length);
    return;
  }
  const body = sel || placeholder;
  insert(ta, before + body + after, s + before.length, s + before.length + body.length);
}

/** Aplica um prefixo de linha (lista, titulo, citacao) em todas as linhas selecionadas. */
function linePrefix(ta, make, strip) {
  const { selectionStart: s, selectionEnd: e, value } = ta;
  const start = value.lastIndexOf("\n", s - 1) + 1;
  let end = value.indexOf("\n", e);
  if (end === -1) end = value.length;
  const lines = value.slice(start, end).split("\n");
  const all = lines.every((l) => strip.test(l) && l.replace(strip, "") !== l);
  const next = lines.map((l, i) => (all ? l.replace(strip, "") : make(l.replace(strip, ""), i))).join("\n");
  ta.setSelectionRange(start, end);
  insert(ta, next || "", start + next.length);
}

const LIST_RE = /^\s*([-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+|>\s?)/;
const HEAD_RE = /^#{1,3}\s+/;

const ACTIONS = {
  h1: (ta) => linePrefix(ta, (l) => `# ${l}`, HEAD_RE),
  h2: (ta) => linePrefix(ta, (l) => `## ${l}`, HEAD_RE),
  bold: (ta) => wrap(ta, "**"),
  italic: (ta) => wrap(ta, "*"),
  strike: (ta) => wrap(ta, "~~"),
  mark: (ta) => wrap(ta, "=="),
  ul: (ta) => linePrefix(ta, (l) => `- ${l}`, LIST_RE),
  ol: (ta) => linePrefix(ta, (l, i) => `${i + 1}. ${l}`, LIST_RE),
  task: (ta) => linePrefix(ta, (l) => `- [ ] ${l}`, LIST_RE),
  quote: (ta) => linePrefix(ta, (l) => `> ${l}`, LIST_RE),
  code: (ta) => {
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    if (sel.includes("\n")) wrap(ta, "```\n", "\n```", "");
    else wrap(ta, "`", "`", "codigo");
  },
  link: (ta) => {
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const sel = value.slice(s, e);
    if (/^(https?:\/\/|www\.)\S+$/.test(sel)) insert(ta, `[link](${sel})`, s + 1, s + 5);
    else {
      const text = sel || "texto";
      insert(ta, `[${text}](https://)`, s + text.length + 3, s + text.length + 11);
    }
  },
  hr: (ta) => {
    const { selectionStart: s, value } = ta;
    const pre = s > 0 && value[s - 1] !== "\n" ? "\n" : "";
    const text = `${pre}\n---\n\n`;
    insert(ta, text, s + text.length);
  },
};

const TOOLS = [
  { id: "h1", label: "Título", text: "T1" },
  { id: "h2", label: "Subtítulo", text: "T2" },
  { id: "bold", label: "Negrito (Ctrl+B)", text: "B", cls: "b" },
  { id: "italic", label: "Itálico (Ctrl+I)", text: "I", cls: "i" },
  { id: "strike", label: "Riscado", text: "S", cls: "s" },
  { id: "mark", label: "Destacar", text: "M", cls: "m" },
  { sep: true },
  { id: "ul", label: "Lista", icon: "listUl" },
  { id: "ol", label: "Lista numerada", icon: "listOl" },
  { id: "task", label: "Checklist", icon: "checklist" },
  { id: "quote", label: "Citação", icon: "quote" },
  { id: "code", label: "Código", icon: "code" },
  { id: "link", label: "Link (Ctrl+K)", icon: "link" },
  { id: "hr", label: "Divisor", icon: "minus" },
];

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

export function NotesEditor({ value, onChange, placeholder = "Escreva aqui. Use a barra para formatar." }) {
  const [draft, setDraft] = useState(() => normalizeNewlines(value));
  const [editing, setEditing] = useState(() => !value);
  const [full, setFull] = useState(false);
  const ta = useRef(null);
  const timer = useRef(null);
  const latest = useRef(draft);
  latest.current = draft;

  // Atualizacao vinda de outra pessoa (sincronizacao) quando nao estou digitando.
  useEffect(() => {
    if (!editing) setDraft(normalizeNewlines(value));
  }, [value, editing]);

  const save = useCallback(
    (text) => {
      clearTimeout(timer.current);
      if (text !== normalizeNewlines(value)) onChange(text);
    },
    [onChange, value]
  );

  const change = (text) => {
    setDraft(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(text), SAVE_DELAY);
  };

  // Garante que nada se perde ao fechar o cartao.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => () => saveRef.current(latest.current), []);

  useEffect(() => {
    if (!full) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setFull(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [full]);

  const html = useMemo(() => renderMarkdown(draft), [draft]);
  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;

  const run = (id) => {
    if (!editing) {
      setEditing(true);
      requestAnimationFrame(() => ta.current && ACTIONS[id](ta.current));
      return;
    }
    ACTIONS[id](ta.current);
  };

  const onKeyDown = (e) => {
    const el = e.currentTarget;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && ["b", "i", "k"].includes(e.key.toLowerCase())) {
      e.preventDefault();
      run({ b: "bold", i: "italic", k: "link" }[e.key.toLowerCase()]);
      return;
    }
    if (mod && e.key === "Enter") {
      e.preventDefault();
      save(el.value);
      setEditing(false);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      const { selectionStart: s, selectionEnd: end, value: v } = el;
      if (s !== end) return;
      const lineStart = v.lastIndexOf("\n", s - 1) + 1;
      const line = v.slice(lineStart, s);
      const m = line.match(/^(\s*)([-*+]\s+\[[ xX]\]\s+|[-*+]\s+|(\d+)([.)])\s+|>\s?)/);
      if (!m) return;
      e.preventDefault();
      if (!line.slice(m[0].length).trim()) {
        // Item vazio: encerra a lista (o Chrome deixaria o cursor antes da quebra de linha).
        el.setSelectionRange(lineStart, s);
        insert(el, "", lineStart);
        return;
      }
      let marker = m[2];
      if (m[3]) marker = `${Number(m[3]) + 1}${m[4]} `;
      else marker = marker.replace(/\[[xX]\]/, "[ ]");
      const text = `\n${m[1]}${marker}`;
      insert(el, text, s + text.length);
      return;
    }
    if (e.key === "Tab") {
      const { selectionStart: s, value: v } = el;
      const lineStart = v.lastIndexOf("\n", s - 1) + 1;
      if (!LIST_RE.test(v.slice(lineStart))) return;
      e.preventDefault();
      el.setSelectionRange(lineStart, lineStart);
      if (e.shiftKey) {
        if (v.startsWith("  ", lineStart)) {
          el.setSelectionRange(lineStart, lineStart + 2);
          insert(el, "", Math.max(lineStart, s - 2));
        } else el.setSelectionRange(s, s);
      } else insert(el, "  ", s + 2);
    }
  };

  const onPreviewClick = (e) => {
    const box = e.target.closest('input[type="checkbox"][data-line]');
    if (box) {
      const next = toggleTaskLine(draft, Number(box.dataset.line));
      setDraft(next);
      save(next);
      return;
    }
    if (e.target.closest("a")) return;
    setEditing(true);
  };

  useEffect(() => {
    if (editing && ta.current && document.activeElement !== ta.current) {
      ta.current.focus();
      const end = ta.current.value.length;
      ta.current.setSelectionRange(end, end);
    }
  }, [editing, full]);

  const body = (
    <div className={`notes ${full ? "full" : ""} ${editing ? "is-editing" : "is-reading"}`}>
      <div className="notes-bar" role="toolbar" aria-label="Formatação">
        <div className="notes-tools">
          {TOOLS.map((t, i) =>
            t.sep ? (
              <span key={`s${i}`} className="notes-sep" />
            ) : (
              <button
                key={t.id}
                type="button"
                className={`tool ${t.cls || ""}`}
                title={t.label}
                aria-label={t.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => run(t.id)}
              >
                {t.icon ? <Icon name={t.icon} size={17} /> : t.text}
              </button>
            )
          )}
        </div>
        <div className="notes-modes">
          <button
            type="button"
            className="tool wide"
            onClick={() => {
              if (editing) save(draft);
              setEditing(!editing);
            }}
            title={editing ? "Ver formatado (Ctrl+Enter)" : "Editar"}
          >
            <Icon name={editing ? "eye" : "pencil"} size={16} />
            <span>{editing ? "Ver" : "Editar"}</span>
          </button>
          <button type="button" className="tool" onClick={() => setFull(!full)} title={full ? "Sair da tela cheia" : "Tela cheia"} aria-label={full ? "Sair da tela cheia" : "Tela cheia"}>
            <Icon name={full ? "shrink" : "expand"} size={16} />
          </button>
        </div>
      </div>

      {editing ? (
        <textarea
          ref={ta}
          className="notes-input"
          value={draft}
          onChange={(e) => change(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => save(latest.current)}
          placeholder={placeholder}
          spellCheck
        />
      ) : (
        <div className="notes-view md" onClick={onPreviewClick} dangerouslySetInnerHTML={{ __html: html || `<p class="notes-empty">${placeholder}</p>` }} />
      )}

      <div className="notes-foot">
        <span>
          {words} {words === 1 ? "palavra" : "palavras"}
        </span>
        {editing && <span className="notes-help">Enter continua listas. Ctrl+Enter para ver formatado.</span>}
      </div>
    </div>
  );

  return full ? createPortal(<div className="notes-overlay">{body}</div>, document.body) : body;
}
