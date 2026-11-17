// ============================================================================
// API DO S'KITTY (Netlify Function + Netlify Blobs)
// ============================================================================
// Rotas (todas em /api):
//   GET    /api/health
//   GET    /api/openapi.json                especificacao para agentes de IA
//   POST   /api/boards                      cria quadro compartilhado -> { code }
//   GET    /api/boards/:code                quadro em JSON  (?format=md -> texto)
//   PUT    /api/boards/:code                envia o quadro inteiro; o servidor junta
//   PATCH  /api/boards/:code                muda nome e/ou prazo do projeto
//   POST   /api/boards/:code/cards          cria uma tarefa
//   PATCH  /api/boards/:code/cards/:id      edita ou move uma tarefa
//   DELETE /api/boards/:code/cards/:id      apaga uma tarefa
//   POST   /api/boards/:code/columns        cria coluna
//   POST   /api/boards/:code/import         cria varias tarefas a partir de texto
//
// O codigo (SK-XXXX-XXXX) e a chave de acesso: quem tem o codigo le e edita.

import { getStore } from "@netlify/blobs";
import {
  addCard,
  addColumn,
  boardToMarkdown,
  createBoard,
  doneColumnIds,
  findColumn,
  liveColumns,
  makeShareCode,
  mergeBoards,
  normalizeCode,
  normalizeUrl,
  parseTaskList,
  resolveMembers,
  resolveTags,
  sanitizeBoard,
  touchCard,
  touchMeta,
  uid,
} from "../../shared/model.js";
import { openApiSpec } from "../../shared/openapi.js";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type",
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS } });

const fail = (message, status = 400) => json({ error: message }, status);

const store = () => getStore({ name: "skitty-boards", consistency: "strong" });

async function load(code) {
  const res = await store().getWithMetadata(code, { type: "json" });
  if (!res || !res.data) return null;
  return { record: res.data, etag: res.etag };
}

/** Le, aplica change(board) e grava. Repete se outra pessoa gravou no meio. */
async function update(code, change) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await load(code);
    if (!current) return null;
    const board = change(current.record.board);
    const record = { board, version: (current.record.version || 0) + 1, savedAt: Date.now() };
    const result = await store().setJSON(code, record, current.etag ? { onlyIfMatch: current.etag } : undefined);
    if (!result || result.modified !== false) return record;
  }
  throw new Error("muitas edições ao mesmo tempo, tente de novo");
}

async function body(req) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

const asList = (v) => (Array.isArray(v) ? v : typeof v === "string" && v.trim() ? v.split(",") : []);

/** Converte o que veio da API em campos de cartao. Aceita nomes para coluna, etiquetas e pessoas. */
function cardFields(board, input) {
  const fields = {};
  let next = board;
  if (input.title !== undefined) fields.title = String(input.title).slice(0, 200);
  if (input.desc !== undefined) fields.desc = String(input.desc).slice(0, 50000);
  if (input.priority !== undefined) fields.priority = Math.max(0, Math.min(3, Number(input.priority) || 0));
  if (input.due !== undefined) {
    const due = String(input.due || "");
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw badRequest("prazo deve estar no formato AAAA-MM-DD");
    fields.due = due;
  }
  if (input.checklist !== undefined) {
    fields.checklist = asList(input.checklist).slice(0, 60).map((item) =>
      typeof item === "string" ? { id: uid("chk_"), text: item.trim().slice(0, 200), done: false } : { id: item.id || uid("chk_"), text: String(item.text || "").slice(0, 200), done: !!item.done }
    );
  }
  if (input.links !== undefined) {
    fields.links = asList(input.links).slice(0, 20).map((l) =>
      typeof l === "string" ? { id: uid("lnk_"), url: normalizeUrl(l), title: "" } : { id: l.id || uid("lnk_"), url: normalizeUrl(l.url), title: String(l.title || "").slice(0, 120) }
    );
  }
  if (input.images !== undefined) {
    fields.images = asList(input.images)
      .slice(0, 8)
      .map((i) => (typeof i === "string" ? i : i.src))
      .filter((src) => /^https?:\/\//.test(String(src)))
      .map((src) => ({ id: uid("img_"), src }));
  }
  if (input.tags !== undefined) {
    const r = resolveTags(next, asList(input.tags));
    next = r.board;
    fields.tags = r.ids;
  }
  const people = input.assignees ?? input.people;
  if (people !== undefined) {
    const r = resolveMembers(next, asList(people));
    next = r.board;
    fields.assignees = r.ids;
  }
  const colRef = input.column ?? input.columnId;
  if (input.done === true) fields.columnId = doneColumnIds(next)[0];
  else if (colRef !== undefined) {
    const col = findColumn(next, colRef);
    if (!col) throw badRequest(`coluna não encontrada: ${colRef}. Colunas: ${liveColumns(next).map((c) => c.name).join(", ")}`);
    fields.columnId = col.id;
  }
  return { board: next, fields };
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/(\.netlify\/functions\/)?api\/?/, "").split("/").filter(Boolean);
  const [resource, rawCode, sub, subId] = parts;

  try {
    if (resource === "health") return json({ ok: true, time: Date.now() });
    if (resource === "openapi.json") return json(openApiSpec(url.origin));
    if (resource !== "boards") return fail("rota não encontrada", 404);

    if (!rawCode) {
      if (req.method !== "POST") return fail("use POST para criar", 405);
      const input = await body(req);
      let board = input.board ? sanitizeBoard(input.board) : createBoard(String(input.name || "Novo projeto").slice(0, 80));
      for (let i = 0; i < 5; i++) {
        const code = makeShareCode();
        if (await load(code)) continue;
        board = { ...board, code };
        await store().setJSON(code, { board, version: 1, savedAt: Date.now() });
        return json({ code, board, version: 1 }, 201);
      }
      return fail("não consegui gerar um código, tente de novo", 500);
    }

    const code = normalizeCode(rawCode);
    if (!code) return fail("código inválido (formato SK-XXXX-XXXX)", 400);

    if (!sub) {
      if (req.method === "GET") {
        const found = await load(code);
        if (!found) return fail("quadro não encontrado", 404);
        const since = Number(url.searchParams.get("since") || 0);
        if (since && since >= found.record.version) return json({ version: found.record.version, unchanged: true });
        if (url.searchParams.get("format") === "md") {
          return new Response(boardToMarkdown(found.record.board), { headers: { "content-type": "text/markdown; charset=utf-8", ...CORS } });
        }
        return json({ code, board: found.record.board, version: found.record.version });
      }
      if (req.method === "PUT") {
        const input = await body(req);
        const incoming = sanitizeBoard(input.board);
        const record = await update(code, (current) => ({ ...mergeBoards(current, incoming), code }));
        if (!record) return fail("quadro não encontrado", 404);
        return json({ code, board: record.board, version: record.version });
      }
      if (req.method === "PATCH") {
        const input = await body(req);
        const patch = {};
        if (input.name !== undefined) {
          if (!String(input.name).trim()) return fail("o nome não pode ficar vazio");
          patch.name = String(input.name).trim().slice(0, 80);
        }
        if (input.due !== undefined) {
          const due = String(input.due || "");
          if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return fail("prazo deve estar no formato AAAA-MM-DD");
          patch.due = due;
        }
        if (!Object.keys(patch).length) return fail("envie name e/ou due");
        const record = await update(code, (board) => touchMeta(board, patch));
        if (!record) return fail("quadro não encontrado", 404);
        return json({ meta: record.board.meta, version: record.version });
      }
      return fail("método não permitido", 405);
    }

    if (sub === "cards") {
      const input = req.method === "DELETE" ? {} : await body(req);
      if (!subId && req.method === "POST") {
        if (!input.title) return fail("informe o título (title)");
        let created = null;
        const record = await update(code, (board) => {
          const { board: next, fields } = cardFields(board, input);
          const r = addCard(next, fields);
          created = r.card;
          return r.board;
        });
        if (!record) return fail("quadro não encontrado", 404);
        return json({ card: record.board.cards[created.id], version: record.version }, 201);
      }
      if (subId && (req.method === "PATCH" || req.method === "DELETE")) {
        const record = await update(code, (board) => {
          if (!board.cards[subId] || board.cards[subId].deleted) throw Object.assign(new Error("tarefa não encontrada"), { status: 404 });
          if (req.method === "DELETE") return touchCard(board, subId, { deleted: true });
          const { board: next, fields } = cardFields(board, input);
          return touchCard(next, subId, fields);
        });
        if (!record) return fail("quadro não encontrado", 404);
        return json({ card: record.board.cards[subId], version: record.version });
      }
      return fail("método não permitido", 405);
    }

    if (sub === "columns" && req.method === "POST") {
      const input = await body(req);
      if (!input.name) return fail("informe o nome (name)");
      let column = null;
      const record = await update(code, (board) => {
        const r = addColumn(board, String(input.name).slice(0, 60));
        column = r.column;
        return r.board;
      });
      if (!record) return fail("quadro não encontrado", 404);
      return json({ column, version: record.version }, 201);
    }

    if (sub === "import" && req.method === "POST") {
      const input = await body(req);
      const tasks = parseTaskList(input.text);
      if (!tasks.length) return fail("nenhuma tarefa encontrada no texto");
      const ids = [];
      const record = await update(code, (board) => {
        let next = board;
        for (const t of tasks.slice(0, 300)) {
          const colName = t.column || input.column;
          if (colName && !findColumn(next, colName)) next = addColumn(next, String(colName).slice(0, 60)).board;
          const { board: withRefs, fields } = cardFields(next, {
            title: t.title,
            tags: t.tags,
            assignees: t.people,
            priority: t.priority,
            due: t.due,
            ...(colName ? { column: colName } : {}),
          });
          const r = addCard(withRefs, fields);
          next = r.board;
          ids.push(r.card.id);
        }
        return next;
      });
      if (!record) return fail("quadro não encontrado", 404);
      return json({ created: ids.length, ids, version: record.version }, 201);
    }

    return fail("rota não encontrada", 404);
  } catch (err) {
    return fail(err.message || "erro interno", err.status || 500);
  }
};

export const config = { path: "/api/*" };
