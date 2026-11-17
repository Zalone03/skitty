// Testes rapidos do modelo: node scripts/test-model.mjs
import assert from "node:assert/strict";
import {
  addCard,
  addMember,
  boardToMarkdown,
  cardsIn,
  createBoard,
  dueInfo,
  liveColumns,
  makeShareCode,
  mergeBoards,
  normalizeCode,
  orderFor,
  parseTaskList,
  projectDueInfo,
  projectProgress,
  resolveMembers,
  resolveTags,
  sanitizeBoard,
  shiftColumn,
  touchCard,
  touchColumn,
  touchMeta,
} from "../shared/model.js";

let passed = 0;
const test = (name, fn) => {
  fn();
  passed++;
  console.log(`ok  ${name}`);
};
const sleep = (ms) => {
  const end = Date.now() + ms;
  while (Date.now() < end);
};

test("codigo de compartilhamento", () => {
  const code = makeShareCode();
  assert.match(code, /^SK-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(normalizeCode(code.toLowerCase().replace(/-/g, " ")), code);
  assert.equal(normalizeCode("SK-0000-0000"), null);
  assert.equal(normalizeCode("abc"), null);
});

test("criar quadro e cartao", () => {
  let b = createBoard("Teste");
  assert.equal(liveColumns(b).length, 4);
  const r = addCard(b, { title: "A" });
  b = r.board;
  assert.equal(cardsIn(b, liveColumns(b)[1].id).length, 1);
});

test("mover para concluidas marca doneAt", () => {
  let b = createBoard();
  const cols = liveColumns(b);
  const { board, card } = addCard(b, { title: "X", columnId: cols[0].id });
  b = touchCard(board, card.id, { columnId: cols[3].id });
  assert.ok(b.cards[card.id].doneAt);
  b = touchCard(b, card.id, { columnId: cols[1].id });
  assert.equal(b.cards[card.id].doneAt, null);
});

test("juntar edicoes de duas pessoas sem perder nada", () => {
  const base = addCard(createBoard(), { title: "Original" }).board;
  const id = Object.keys(base.cards)[0];
  sleep(3);
  const a = addCard(touchCard(base, id, { title: "Editado por A" }), { title: "Nova de A" }).board;
  sleep(3);
  const bOnly = addCard(base, { title: "Nova de B" }).board;
  const merged = mergeBoards(a, bOnly);
  const titles = Object.values(merged.cards).map((c) => c.title).sort();
  assert.deepEqual(titles, ["Editado por A", "Nova de A", "Nova de B"]);
  // A ordem de juntar nao muda o resultado
  const merged2 = mergeBoards(bOnly, a);
  assert.deepEqual(Object.values(merged2.cards).map((c) => c.title).sort(), titles);
});

test("apagar sobrevive a sincronizacao", () => {
  const base = addCard(createBoard(), { title: "Some" }).board;
  const id = Object.keys(base.cards)[0];
  sleep(3);
  const deleted = touchCard(base, id, { deleted: true });
  const merged = mergeBoards(base, deleted);
  assert.equal(merged.cards[id].deleted, true);
});

test("ordem ao arrastar", () => {
  let b = createBoard();
  const col = liveColumns(b)[0].id;
  for (const t of ["1", "2", "3"]) {
    b = addCard(b, { title: t, columnId: col }).board;
    sleep(2);
  }
  const [c1, , c3] = cardsIn(b, col);
  b = touchCard(b, c3.id, { order: orderFor(b, col, c1.id, c3.id) });
  assert.deepEqual(cardsIn(b, col).map((c) => c.title), ["3", "1", "2"]);
});

test("colunas: mover e personalizar", () => {
  let b = createBoard();
  const [a, second] = liveColumns(b);
  b = shiftColumn(b, a.id, 1);
  assert.equal(liveColumns(b)[0].id, second.id);
  b = touchColumn(b, a.id, { name: "Backlog", color: "#ff0000", wip: 5 });
  assert.equal(b.columns[a.id].name, "Backlog");
});

test("etiquetas e pessoas por nome", () => {
  let b = createBoard();
  const t = resolveTags(b, ["Arte", "Novidade"]);
  assert.equal(t.ids.length, 2);
  assert.equal(t.board.settings.tags.length, 5);
  const p = resolveMembers(t.board, ["Gui", "gui", "Ana"]);
  assert.equal(p.ids.length, 2);
  b = addMember(p.board, "Ana").board;
  assert.equal(Object.keys(b.members).length, 2);
});

test("ler lista de texto", () => {
  const tasks = parseTaskList("## Fazendo\n- [ ] Desenhar cabeça #Arte @Gui_Souza !alta prazo:2026-12-01\n* Corrigir dash\n\n1. Terceira #Código");
  assert.equal(tasks.length, 3);
  assert.deepEqual(tasks[0], { title: "Desenhar cabeça", tags: ["Arte"], people: ["Gui Souza"], priority: 3, due: "2026-12-01", column: "Fazendo" });
  assert.equal(tasks[1].title, "Corrigir dash");
  assert.deepEqual(tasks[2].tags, ["Código"]);
});

test("texto do quadro volta como tarefas (ida e volta)", () => {
  let b = createBoard("Ida e volta");
  b = addCard(b, { title: "Tarefa com prazo", due: "2030-01-01", priority: 2 }).board;
  const md = boardToMarkdown(b);
  const tasks = parseTaskList(md);
  const t = tasks.find((x) => x.title === "Tarefa com prazo");
  assert.ok(t, md);
  assert.equal(t.due, "2030-01-01");
  assert.equal(t.priority, 2);
});

test("prazo em texto claro", () => {
  const today = new Date(2026, 10, 15);
  assert.equal(dueInfo("2026-11-13", false, today).label, "Atrasado 2 dias");
  assert.equal(dueInfo("2026-11-14", false, today).label, "Atrasado 1 dia");
  assert.equal(dueInfo("2026-11-15", false, today).label, "Vence hoje");
  assert.equal(dueInfo("2026-11-16", false, today).label, "Vence amanhã");
  assert.equal(dueInfo("2026-11-20", false, today).label, "Vence em 5 dias");
  assert.equal(dueInfo("2026-12-25", false, today).tone, "later");
  assert.equal(dueInfo("2026-11-01", true, today).tone, "done");
  assert.equal(dueInfo("", false, today), null);
});

test("prazo do projeto", () => {
  const today = new Date(2026, 10, 15);
  let b = createBoard("Jogo");
  assert.equal(projectDueInfo(b, today), null);
  b = touchMeta(b, { due: "2026-11-27" });
  assert.equal(projectDueInfo(b, today).label, "Entrega em 12 dias");
  b = touchMeta(b, { due: "2026-11-20" });
  assert.equal(projectDueInfo(b, today).label, "Entrega em 5 dias");
  b = touchMeta(b, { due: "2026-11-15" });
  assert.equal(projectDueInfo(b, today).label, "Entrega hoje");
  b = touchMeta(b, { due: "2026-11-10" });
  assert.equal(projectDueInfo(b, today).label, "Atrasado 5 dias");
  b = touchMeta(b, { due: "2027-03-01" });
  assert.equal(projectDueInfo(b, today).label, "Entrega 01/03/27");
  const cols = liveColumns(b);
  b = addCard(b, { title: "Feita", columnId: cols[3].id }).board;
  assert.deepEqual(projectProgress(b), { done: 1, total: 1 });
  assert.match(projectDueInfo(b, today).label, /^Entregue/);
  assert.match(boardToMarkdown(b), /Prazo do projeto: 2027-03-01/);
  assert.equal(sanitizeBoard(b).meta.due, "2027-03-01");
  assert.equal(sanitizeBoard({ ...b, meta: { ...b.meta, due: "logo" } }).meta.due, "");
});

test("validar dados de fora", () => {
  const dirty = createBoard();
  const id = "card_x";
  dirty.cards[id] = { id, title: "x".repeat(500), due: "ontem", images: [{ src: "javascript:alert(1)" }, { src: "https://ok.com/a.png" }], links: [{ url: "site.com" }] };
  const clean = sanitizeBoard(dirty);
  assert.equal(clean.cards[id].title.length, 200);
  assert.equal(clean.cards[id].due, "");
  assert.equal(clean.cards[id].images.length, 1);
  assert.equal(clean.cards[id].links[0].url, "https://site.com");
  assert.throws(() => sanitizeBoard(null));
});

// ---------------------------------------------------------------------------
// Notas (markdown)
// ---------------------------------------------------------------------------
const { renderMarkdown, toggleTaskLine, plainText, noteTasks } = await import("../src/markdown.js");

test("notas: HTML colado nunca vira codigo", () => {
  const html = renderMarkdown('<script>alert(1)</script> <img src=x onerror=alert(1)> "aspas"');
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("<img"));
  assert.match(html, /&lt;script&gt;/);
});

test("notas: links seguros", () => {
  const ok = renderMarkdown("[site](https://exemplo.com) e www.teste.com");
  assert.match(ok, /<a href="https:\/\/exemplo.com" target="_blank" rel="noopener noreferrer">site<\/a>/);
  assert.match(ok, /href="https:\/\/www.teste.com"/);
  const bad = renderMarkdown("[x](javascript:alert(1)) [y](data:text/html,oi)");
  assert.ok(!bad.includes("<a"), bad);
});

test("notas: formatacao", () => {
  const html = renderMarkdown("# Titulo\n**negrito** *italico* ~~riscado~~ ==destaque== `codigo`\n\n- um\n- dois\n\n1. a\n2. b\n\n> citacao\n\n---\n\n```\nlet x = <b>\n```");
  for (const tag of ["<h2>Titulo</h2>", "<strong>negrito</strong>", "<em>italico</em>", "<del>riscado</del>", "<mark>destaque</mark>", "<code>codigo</code>", "<ul>", "<ol>", "<blockquote>", "<hr>", "<pre><code>let x = &lt;b&gt;</code></pre>"]) {
    assert.ok(html.includes(tag), `faltou ${tag} em ${html}`);
  }
  assert.ok(!renderMarkdown("snake_case_nome").includes("<em>"));
});

test("notas: checklist marca e desmarca", () => {
  const md = "Lista\n- [ ] comprar\n- [x] feito";
  const html = renderMarkdown(md);
  assert.match(html, /data-line="1"/);
  assert.match(html, /data-line="2" checked/);
  const toggled = toggleTaskLine(md, 1);
  assert.equal(toggled, "Lista\n- [x] comprar\n- [x] feito");
  assert.equal(toggleTaskLine(toggled, 2), "Lista\n- [x] comprar\n- [ ] feito");
  assert.deepEqual(noteTasks(md), { total: 2, done: 1 });
});

test("notas: resumo em texto puro", () => {
  assert.equal(plainText("## Ideia\n**Forte** e *leve*\n- [ ] item\n[link](https://a.com)"), "Ideia\nForte e leve\nitem\nlink");
});

test("contexto do projeto leva notas e nao vira tarefa ao colar", () => {
  let b = createBoard("Ctx");
  b = addCard(b, { title: "Com notas", desc: "## Plano\n- passo um\n- [ ] passo dois", images: [{ id: "i", src: "https://x.com/a.png" }] }).board;
  const md = boardToMarkdown(b, { ids: false });
  assert.ok(!md.includes("[id:"));
  assert.match(md, /  > ## Plano/);
  assert.match(md, /  imagens: 1/);
  const tasks = parseTaskList(md);
  assert.deepEqual(tasks.map((t) => t.title), ["Com notas"]);
});

console.log(`\n${passed} testes passaram`);
