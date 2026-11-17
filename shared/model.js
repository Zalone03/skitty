// ============================================================================
// MODELO DE DADOS DO S'KITTY (usado pelo navegador E pela API do Netlify)
// ============================================================================
//
// Um quadro guarda colunas, cartoes e pessoas em MAPAS por id. Cada item tem
// "updatedAt". Para juntar duas versoes do mesmo quadro (a sua e a de quem
// esta usando junto), vale a edicao mais recente de cada item. Apagar nao
// remove de verdade: marca "deleted: true", senao o item voltaria na proxima
// sincronizacao.

export const SCHEMA = 2;

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sem 0/O, 1/I/L

export const COLORS = ["#7c5cff", "#f97316", "#22c55e", "#3b82f6", "#ef4444", "#eab308", "#14b8a6", "#ec4899", "#64748b"];

export const PRIORITIES = [
  { id: 0, label: "Sem prioridade" },
  { id: 1, label: "Baixa" },
  { id: 2, label: "Média" },
  { id: 3, label: "Alta" },
];

export const now = () => Date.now();

export function uid(prefix = "") {
  return prefix + now().toString(36) + Math.random().toString(36).slice(2, 7);
}

const bump = (old) => Math.max(now(), ((old && old.updatedAt) || 0) + 1);

// ---------------------------------------------------------------------------
// Codigo de compartilhamento: SK-XXXX-XXXX
// ---------------------------------------------------------------------------

export function makeShareCode() {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return `SK-${s.slice(0, 4)}-${s.slice(4)}`;
}

export function normalizeCode(code) {
  const clean = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = clean.startsWith("SK") && clean.length === 10 ? clean.slice(2) : clean;
  if (body.length !== 8) return null;
  for (const ch of body) if (!ALPHABET.includes(ch)) return null;
  return `SK-${body.slice(0, 4)}-${body.slice(4)}`;
}

// ---------------------------------------------------------------------------
// Criacao
// ---------------------------------------------------------------------------

export function createBoard(name = "Novo projeto", color = COLORS[0]) {
  const t = now();
  const columns = {};
  [
    { name: "Ideias", color: COLORS[8] },
    { name: "A fazer", color: COLORS[3] },
    { name: "Fazendo", color: COLORS[1], wip: 3 },
    { name: "Feito", color: COLORS[2], done: true },
  ].forEach((c, i) => {
    const id = uid("col_");
    columns[id] = { id, name: c.name, color: c.color, order: i, wip: c.wip || 0, done: !!c.done, updatedAt: t, deleted: false };
  });
  return {
    schema: SCHEMA,
    id: uid("brd_"),
    code: null,
    meta: { name, color, due: "", updatedAt: t },
    settings: {
      updatedAt: t,
      weeklyGoal: 10,
      tags: [
        { id: "arte", name: "Arte", color: COLORS[1] },
        { id: "codigo", name: "Código", color: COLORS[3] },
        { id: "som", name: "Som", color: COLORS[0] },
        { id: "bug", name: "Bug", color: COLORS[4] },
      ],
    },
    columns,
    members: {},
    cards: {},
  };
}

export function createCard(fields = {}) {
  const t = now();
  return {
    id: uid("card_"),
    title: "Nova tarefa",
    desc: "",
    columnId: null,
    order: t,
    tags: [],
    assignees: [],
    priority: 0,
    due: "",
    checklist: [],
    links: [],
    images: [],
    createdAt: t,
    doneAt: null,
    ...fields,
    updatedAt: t,
    deleted: false,
  };
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export const live = (map) => Object.values(map || {}).filter((x) => !x.deleted);

export function liveColumns(board) {
  return live(board.columns).sort((a, b) => a.order - b.order);
}

export function liveMembers(board) {
  return live(board.members).sort((a, b) => a.name.localeCompare(b.name));
}

export function cardsIn(board, columnId) {
  return live(board.cards)
    .filter((c) => c.columnId === columnId)
    .sort((a, b) => a.order - b.order);
}

export function doneColumnIds(board) {
  const cols = liveColumns(board);
  const marked = cols.filter((c) => c.done).map((c) => c.id);
  if (marked.length) return marked;
  return cols.length ? [cols[cols.length - 1].id] : [];
}

export function findColumn(board, ref) {
  if (!ref) return null;
  const cols = liveColumns(board);
  const key = String(ref).trim().toLowerCase();
  return cols.find((c) => c.id === ref) || cols.find((c) => c.name.trim().toLowerCase() === key) || null;
}

export function startOfWeek(ts = now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export function weeklyDoneCount(board) {
  const since = startOfWeek();
  const done = new Set(doneColumnIds(board));
  return live(board.cards).filter((c) => done.has(c.columnId) && (c.doneAt || 0) >= since).length;
}

/** Situacao do prazo em texto claro. tone: late | today | soon | later | done */
export function dueInfo(due, isDone, today = new Date()) {
  if (!due) return null;
  const [y, m, d] = due.split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d);
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((target - base) / 86400000);
  const short = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}${y !== base.getFullYear() ? `/${String(y).slice(2)}` : ""}`;
  if (isDone) return { tone: "done", label: `Prazo ${short}`, short, days };
  if (days < 0) return { tone: "late", label: `Atrasado ${-days} ${-days === 1 ? "dia" : "dias"}`, short, days };
  if (days === 0) return { tone: "today", label: "Vence hoje", short, days };
  if (days === 1) return { tone: "soon", label: "Vence amanhã", short, days };
  if (days <= 7) return { tone: "soon", label: `Vence em ${days} dias`, short, days };
  return { tone: "later", label: `Prazo ${short}`, short, days };
}

/** Prazo do projeto: igual ao das tarefas, mas falando de "entrega". */
export function projectDueInfo(board, today = new Date()) {
  const due = board.meta?.due;
  if (!due) return null;
  const { done, total } = projectProgress(board);
  const finished = total > 0 && done === total;
  const info = dueInfo(due, finished, today);
  if (!info) return null;
  const label = finished
    ? `Entregue (prazo ${info.short})`
    : info.tone === "later" && info.days <= 60
    ? `Entrega em ${info.days} dias`
    : info.label.replace("Vence hoje", "Entrega hoje").replace("Vence amanhã", "Entrega amanhã").replace("Vence em", "Entrega em").replace("Prazo", "Entrega");
  return { ...info, label };
}

export function projectProgress(board) {
  const done = new Set(doneColumnIds(board));
  const cards = live(board.cards);
  return { done: cards.filter((c) => done.has(c.columnId)).length, total: cards.length };
}

export function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  return ((parts[0]?.[0] || "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

// ---------------------------------------------------------------------------
// Mudancas (sempre devolvem um quadro NOVO)
// ---------------------------------------------------------------------------

export function touchCard(board, id, patch) {
  const old = board.cards[id];
  if (!old) return board;
  const next = { ...old, ...patch, updatedAt: bump(old) };
  if (patch.columnId && patch.columnId !== old.columnId) {
    next.doneAt = doneColumnIds(board).includes(patch.columnId) ? now() : null;
  }
  return { ...board, cards: { ...board.cards, [id]: next } };
}

export function addCard(board, fields) {
  const cols = liveColumns(board);
  const columnId = fields.columnId || (cols[1] || cols[0])?.id || null;
  const card = createCard({ ...fields, columnId });
  if (doneColumnIds(board).includes(columnId)) card.doneAt = now();
  return { board: { ...board, cards: { ...board.cards, [card.id]: card } }, card };
}

export function touchColumn(board, id, patch) {
  const old = board.columns[id];
  if (!old) return board;
  return { ...board, columns: { ...board.columns, [id]: { ...old, ...patch, updatedAt: bump(old) } } };
}

export function addColumn(board, name, color = COLORS[8]) {
  const cols = liveColumns(board);
  const id = uid("col_");
  const order = cols.length ? cols[cols.length - 1].order + 1 : 0;
  const column = { id, name, color, order, wip: 0, done: false, updatedAt: now(), deleted: false };
  return { board: { ...board, columns: { ...board.columns, [id]: column } }, column };
}

/** Move a coluna uma posicao para a esquerda (-1) ou direita (+1). */
export function shiftColumn(board, id, delta) {
  const cols = liveColumns(board);
  const i = cols.findIndex((c) => c.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= cols.length) return board;
  let next = touchColumn(board, cols[i].id, { order: cols[j].order });
  next = touchColumn(next, cols[j].id, { order: cols[i].order });
  return next;
}

export function touchMember(board, id, patch) {
  const old = board.members?.[id];
  if (!old) return board;
  return { ...board, members: { ...board.members, [id]: { ...old, ...patch, updatedAt: bump(old) } } };
}

export function addMember(board, name, color) {
  const members = liveMembers(board);
  const existing = members.find((m) => m.name.toLowerCase() === String(name).trim().toLowerCase());
  if (existing) return { board, member: existing };
  const id = uid("mem_");
  const member = { id, name: String(name).trim().slice(0, 40), color: color || COLORS[members.length % COLORS.length], updatedAt: now(), deleted: false };
  return { board: { ...board, members: { ...(board.members || {}), [id]: member } }, member };
}

export function touchMeta(board, patch) {
  return { ...board, meta: { ...board.meta, ...patch, updatedAt: bump(board.meta) } };
}

export function touchSettings(board, patch) {
  return { ...board, settings: { ...board.settings, ...patch, updatedAt: bump(board.settings) } };
}

/** Posicao de ordem para encaixar um cartao antes de "beforeId" (ou no fim). */
export function orderFor(board, columnId, beforeId, movingId) {
  const list = cardsIn(board, columnId).filter((c) => c.id !== movingId);
  if (!list.length) return now();
  if (!beforeId) return list[list.length - 1].order + 1000;
  const idx = list.findIndex((c) => c.id === beforeId);
  if (idx < 0) return list[list.length - 1].order + 1000;
  if (idx === 0) return list[0].order - 1000;
  return (list[idx - 1].order + list[idx].order) / 2;
}

/** Converte nomes de etiqueta em ids, criando as que nao existem. */
export function resolveTags(board, names) {
  let tags = [...(board.settings.tags || [])];
  const ids = [];
  let changed = false;
  for (const name of names || []) {
    const key = String(name).trim().toLowerCase();
    if (!key) continue;
    let tag = tags.find((t) => t.id === key || t.name.toLowerCase() === key);
    if (!tag) {
      tag = { id: uid("tag_"), name: String(name).trim().slice(0, 30), color: COLORS[tags.length % COLORS.length] };
      tags = [...tags, tag];
      changed = true;
    }
    if (!ids.includes(tag.id)) ids.push(tag.id);
  }
  return { board: changed ? touchSettings(board, { tags }) : board, ids };
}

/** Converte nomes de pessoas em ids, criando as que nao existem. */
export function resolveMembers(board, names) {
  let next = board;
  const ids = [];
  for (const name of names || []) {
    if (!String(name).trim()) continue;
    const byId = next.members?.[name];
    if (byId && !byId.deleted) {
      ids.push(byId.id);
      continue;
    }
    const r = addMember(next, name);
    next = r.board;
    if (!ids.includes(r.member.id)) ids.push(r.member.id);
  }
  return { board: next, ids };
}

export function normalizeUrl(url) {
  const s = String(url || "").trim();
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

// ---------------------------------------------------------------------------
// Juntar duas versoes (sincronizacao)
// ---------------------------------------------------------------------------

function newer(a, b) {
  if (!a) return b;
  if (!b) return a;
  return (b.updatedAt || 0) >= (a.updatedAt || 0) ? b : a;
}

function mergeMap(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, item] of Object.entries(b || {})) out[id] = newer(a[id], item);
  return out;
}

export function mergeBoards(local, remote) {
  if (!local) return remote;
  if (!remote) return local;
  return {
    ...local,
    schema: SCHEMA,
    code: local.code || remote.code,
    meta: newer(local.meta, remote.meta),
    settings: newer(local.settings, remote.settings),
    columns: mergeMap(local.columns, remote.columns),
    members: mergeMap(local.members, remote.members),
    cards: mergeMap(local.cards, remote.cards),
  };
}

// ---------------------------------------------------------------------------
// Validacao de dados vindos de fora (API, arquivo importado)
// ---------------------------------------------------------------------------

const MAX_IMAGE_CHARS = 900_000;

export function sanitizeBoard(input) {
  if (!input || typeof input !== "object") throw new Error("quadro inválido");
  const base = createBoard();
  const str = (v, max) => String(v ?? "").slice(0, max);
  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const color = (v, d) => (/^#[0-9a-fA-F]{6}$/.test(String(v)) ? String(v) : d);

  const columns = {};
  for (const [id, c] of Object.entries(input.columns || {}).slice(0, 60)) {
    columns[id] = {
      id,
      name: str(c.name, 60) || "Coluna",
      color: color(c.color, COLORS[8]),
      order: num(c.order),
      wip: Math.max(0, Math.min(99, num(c.wip))),
      done: !!c.done,
      updatedAt: num(c.updatedAt),
      deleted: !!c.deleted,
    };
  }

  const members = {};
  for (const [id, m] of Object.entries(input.members || {}).slice(0, 100)) {
    members[id] = { id, name: str(m.name, 40) || "Pessoa", color: color(m.color, COLORS[0]), updatedAt: num(m.updatedAt), deleted: !!m.deleted };
  }

  const cards = {};
  for (const [id, c] of Object.entries(input.cards || {}).slice(0, 3000)) {
    cards[id] = {
      id,
      title: str(c.title, 200) || "Tarefa",
      desc: str(c.desc, 50000),
      columnId: str(c.columnId, 60) || null,
      order: num(c.order),
      tags: Array.isArray(c.tags) ? c.tags.slice(0, 12).map((t) => str(t, 40)) : [],
      assignees: Array.isArray(c.assignees) ? c.assignees.slice(0, 12).map((t) => str(t, 60)) : [],
      priority: Math.max(0, Math.min(3, num(c.priority))),
      due: /^\d{4}-\d{2}-\d{2}$/.test(String(c.due || "")) ? String(c.due) : "",
      checklist: Array.isArray(c.checklist)
        ? c.checklist.slice(0, 60).map((i) => ({ id: str(i.id, 60) || uid("chk_"), text: str(i.text, 200), done: !!i.done }))
        : [],
      links: Array.isArray(c.links)
        ? c.links.slice(0, 20).map((l) => ({ id: str(l.id, 60) || uid("lnk_"), url: normalizeUrl(str(l.url, 1000)), title: str(l.title, 120) }))
        : [],
      images: Array.isArray(c.images)
        ? c.images
            .slice(0, 8)
            .map((i) => ({ id: str(i.id, 60) || uid("img_"), src: String(i.src || "") }))
            .filter((i) => (i.src.startsWith("data:image/") && i.src.length <= MAX_IMAGE_CHARS) || /^https?:\/\//.test(i.src))
        : [],
      createdAt: num(c.createdAt),
      doneAt: c.doneAt ? num(c.doneAt) : null,
      updatedAt: num(c.updatedAt),
      deleted: !!c.deleted,
    };
  }

  const s = input.settings || {};
  return {
    schema: SCHEMA,
    id: str(input.id, 60) || base.id,
    code: input.code ? normalizeCode(input.code) : null,
    meta: {
      name: str(input.meta?.name, 80) || "Projeto",
      color: color(input.meta?.color, COLORS[0]),
      due: /^\d{4}-\d{2}-\d{2}$/.test(String(input.meta?.due || "")) ? String(input.meta.due) : "",
      updatedAt: num(input.meta?.updatedAt),
    },
    settings: {
      updatedAt: num(s.updatedAt),
      weeklyGoal: Math.max(0, Math.min(500, num(s.weeklyGoal, 10))),
      tags: Array.isArray(s.tags)
        ? s.tags.slice(0, 40).map((t) => ({ id: str(t.id, 40) || uid("tag_"), name: str(t.name, 30), color: color(t.color, COLORS[0]) }))
        : base.settings.tags,
    },
    columns,
    members,
    cards,
  };
}

// ---------------------------------------------------------------------------
// Texto para IA e para pessoas
// ---------------------------------------------------------------------------

/**
 * Quadro inteiro em texto (Markdown). ids: inclui [id: ...] de cada tarefa
 * (necessario para agentes editarem pela API; dispensavel para pessoas).
 */
export function boardToMarkdown(board, { ids = true } = {}) {
  const tags = Object.fromEntries((board.settings?.tags || []).map((t) => [t.id, t.name]));
  const people = Object.fromEntries(live(board.members).map((m) => [m.id, m.name]));
  const pr = ["", " !baixa", " !media", " !alta"];
  const done = new Set(doneColumnIds(board));
  const lines = [`# ${board.meta.name}`];
  if (board.code) lines.push(`Código: ${board.code}`);
  const projectDue = projectDueInfo(board);
  const prog = projectProgress(board);
  if (projectDue) lines.push(`Prazo do projeto: ${board.meta.due} (${projectDue.label})`);
  lines.push(`Progresso: ${prog.done} de ${prog.total} tarefas concluídas`);
  const names = Object.values(people);
  if (names.length) lines.push(`Pessoas: ${names.join(", ")}`);
  lines.push(`Concluídas nesta semana: ${weeklyDoneCount(board)} de ${board.settings.weeklyGoal}`, "");
  for (const col of liveColumns(board)) {
    const list = cardsIn(board, col.id);
    lines.push(`## ${col.name} (${list.length}${col.wip ? ` de no máximo ${col.wip}` : ""})`);
    for (const c of list) {
      const t = c.tags.filter((id) => tags[id]).map((id) => ` #${tags[id].replace(/\s+/g, "_")}`).join("");
      const who = c.assignees.filter((id) => people[id]).map((id) => ` @${people[id].replace(/\s+/g, "_")}`).join("");
      const info = dueInfo(c.due, done.has(col.id));
      const due = c.due ? ` prazo:${c.due}${info && !done.has(col.id) ? ` (${info.label})` : ""}` : "";
      lines.push(`- ${c.title}${t}${who}${pr[c.priority] || ""}${due}${ids ? `  [id: ${c.id}]` : ""}`);
      if (c.desc && c.desc.trim()) {
        lines.push(...c.desc.replace(/\r\n?/g, "\n").trim().split("\n").map((l) => `  > ${l}`));
      }
      for (const i of c.checklist) lines.push(`  - [${i.done ? "x" : " "}] ${i.text}`);
      for (const l of c.links) lines.push(`  link: ${l.title ? `${l.title} ` : ""}${l.url}`);
      if (c.images.length) lines.push(`  imagens: ${c.images.length}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/**
 * Le uma lista em texto e devolve tarefas. Aceita, uma por linha:
 *   - [ ] Desenhar cabeca do inimigo #Arte @Gui !alta prazo:2026-12-01
 * "## Nome" muda a coluna das tarefas seguintes.
 */
export function parseTaskList(text) {
  const out = [];
  let column = null;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const head = line.match(/^#{1,3}\s+(.+)$/);
    if (head) {
      column = head[1].replace(/\(.*\)\s*$/, "").trim();
      continue;
    }
    if (/^(link|imagens|c[oó]digo|pessoas|conclu[ií]das[^:]*|prazo do projeto|progresso)\s*:/i.test(line)) continue;
    if (line.startsWith(">")) continue; // notas de um cartao, nao sao tarefas
    let title = line
      .replace(/^([-*+]|\d+[.)])\s+/, "")
      .replace(/^\[( |x|X)\]\s+/, "")
      .replace(/\s*\[id:[^\]]*\]\s*$/, "");
    const tags = [];
    const people = [];
    title = title.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, (_, sp, t) => {
      tags.push(t.replace(/_/g, " "));
      return sp;
    });
    title = title.replace(/(^|\s)@([\p{L}\p{N}_.-]+)/gu, (_, sp, p) => {
      people.push(p.replace(/_/g, " "));
      return sp;
    });
    let priority = 0;
    title = title.replace(/(^|\s)!(alta|media|média|baixa)\b/iu, (_, sp, p) => {
      priority = { baixa: 1, media: 2, "média": 2, alta: 3 }[p.toLowerCase()];
      return sp;
    });
    let due = "";
    title = title.replace(/(^|\s)prazo:(\d{4}-\d{2}-\d{2})(\s*\([^)]*\))?/i, (_, sp, d) => {
      due = d;
      return sp;
    });
    title = title.replace(/\s+/g, " ").trim();
    if (title) out.push({ title, tags, people, priority, due, column });
  }
  return out;
}
