// Testa a API com um servidor local do Netlify Blobs: node scripts/test-api.mjs
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BlobsServer } from "@netlify/blobs/server";

const dir = mkdtempSync(join(tmpdir(), "skitty-blobs-"));
const token = "teste";
const server = new BlobsServer({ directory: dir, token });
const { port } = await server.start();
const edge = `http://localhost:${port}`;
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({ edgeURL: edge, uncachedEdgeURL: edge, siteID: "site-teste", token })).toString("base64");

const { default: handler } = await import("../netlify/functions/api.mjs");
const { createBoard, mergeBoards } = await import("../shared/model.js");

const call = async (method, path, body) => {
  const res = await handler(new Request(`https://skitty.test/api${path}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }));
  const text = await res.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* markdown */
  }
  return { status: res.status, data, type: res.headers.get("content-type") };
};

let passed = 0;
const test = async (name, fn) => {
  await fn();
  passed++;
  console.log(`ok  ${name}`);
};

try {
  await test("health e openapi", async () => {
    assert.equal((await call("GET", "/health")).data.ok, true);
    const spec = (await call("GET", "/openapi.json")).data;
    assert.equal(spec.servers[0].url, "https://skitty.test/api");
    assert.ok(spec.paths["/boards/{code}/cards"].post);
  });

  let code;
  await test("criar quadro compartilhado", async () => {
    const r = await call("POST", "/boards", { board: createBoard("S'kill Master") });
    assert.equal(r.status, 201);
    code = r.data.code;
    assert.match(code, /^SK-/);
  });

  await test("codigo invalido e inexistente", async () => {
    assert.equal((await call("GET", "/boards/xyz")).status, 400);
    assert.equal((await call("GET", "/boards/SK-AAAA-BBBB")).status, 404);
  });

  let cardId;
  await test("criar tarefa por nomes (coluna, etiqueta, pessoa)", async () => {
    const r = await call("POST", `/boards/${code}/cards`, {
      title: "Desenhar inimigo",
      column: "fazendo",
      tags: ["Arte", "Sprite"],
      assignees: ["Gui"],
      priority: 3,
      due: "2026-12-01",
      checklist: ["Rascunho", "Cor"],
      links: ["exemplo.com/ref"],
    });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    cardId = r.data.card.id;
    assert.equal(r.data.card.tags.length, 2);
    assert.equal(r.data.card.assignees.length, 1);
    assert.equal(r.data.card.links[0].url, "https://exemplo.com/ref");
  });

  await test("coluna errada da erro claro", async () => {
    const r = await call("POST", `/boards/${code}/cards`, { title: "X", column: "Nao existe" });
    assert.equal(r.status, 400);
    assert.match(r.data.error, /coluna não encontrada/);
  });

  await test("mover para concluidas e editar", async () => {
    const r = await call("PATCH", `/boards/${code}/cards/${cardId}`, { done: true, title: "Desenhar inimigo melee" });
    assert.equal(r.status, 200);
    assert.ok(r.data.card.doneAt);
    assert.equal(r.data.card.title, "Desenhar inimigo melee");
  });

  await test("importar lista de texto (com coluna nova)", async () => {
    const r = await call("POST", `/boards/${code}/import`, { text: "## Revisão\n- Revisar sprites #Arte @Ana !media\n- Testar fase 1 prazo:2026-12-10" });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.created, 2);
  });

  await test("ler em texto para IA", async () => {
    const r = await call("GET", `/boards/${code}?format=md`);
    assert.match(r.type, /markdown/);
    assert.match(r.data, /## Revisão/);
    assert.match(r.data, /Revisar sprites #Arte @Ana !media/);
    assert.match(r.data, /Pessoas: .*Gui/);
  });

  await test("sincronizar: duas pessoas editando ao mesmo tempo", async () => {
    const a = (await call("GET", `/boards/${code}`)).data;
    const b = JSON.parse(JSON.stringify(a.board));
    const cards = Object.keys(a.board.cards);
    a.board.cards[cards[0]] = { ...a.board.cards[cards[0]], title: "Mudado por A", updatedAt: Date.now() + 10 };
    b.cards[cards[1]] = { ...b.cards[cards[1]], title: "Mudado por B", updatedAt: Date.now() + 10 };
    await call("PUT", `/boards/${code}`, { board: a.board });
    const r = await call("PUT", `/boards/${code}`, { board: b });
    const titles = Object.values(r.data.board.cards).map((c) => c.title);
    assert.ok(titles.includes("Mudado por A") && titles.includes("Mudado por B"));
    const unchanged = await call("GET", `/boards/${code}?since=${r.data.version}`);
    assert.equal(unchanged.data.unchanged, true);
    assert.ok(mergeBoards(a.board, r.data.board));
  });

  await test("prazo e nome do projeto", async () => {
    const r = await call("PATCH", `/boards/${code}`, { due: "2026-12-20", name: "S'kill Master v2" });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.meta.due, "2026-12-20");
    assert.equal((await call("PATCH", `/boards/${code}`, { due: "amanha" })).status, 400);
    assert.equal((await call("PATCH", `/boards/${code}`, {})).status, 400);
    const md = (await call("GET", `/boards/${code}?format=md`)).data;
    assert.match(md, /# S'kill Master v2/);
    assert.match(md, /Prazo do projeto: 2026-12-20/);
  });

  await test("apagar tarefa", async () => {
    assert.equal((await call("DELETE", `/boards/${code}/cards/${cardId}`)).status, 200);
    assert.equal((await call("DELETE", `/boards/${code}/cards/${cardId}`)).status, 404);
  });

  console.log(`\n${passed} testes da API passaram`);
} finally {
  await server.stop();
  rmSync(dir, { recursive: true, force: true });
}
