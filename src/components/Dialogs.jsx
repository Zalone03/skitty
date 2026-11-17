import { useMemo, useState } from "react";
import {
  addColumn,
  addCard,
  addMember,
  boardToMarkdown,
  cardsIn,
  COLORS,
  findColumn,
  liveColumns,
  liveMembers,
  normalizeCode,
  parseTaskList,
  projectDueInfo,
  projectProgress,
  resolveMembers,
  resolveTags,
  sanitizeBoard,
  shiftColumn,
  touchCard,
  touchColumn,
  touchMember,
  touchMeta,
  touchSettings,
  uid,
} from "../../shared/model.js";
import { api, apiBase, siteUrl } from "../api.js";
import { safeFileName, saveText } from "../files.js";
import { newProject } from "../useStore.js";
import { Avatar, ColorDots, copyText, Icon, Logo, Modal } from "./ui.jsx";

// ===========================================================================
// PROJETO NOVO E BOAS-VINDAS
// ===========================================================================

function NewProjectForm({ onCreate, defaultPerson = "", submitLabel = "Criar projeto", autoFocus = true }) {
  const [name, setName] = useState("");
  const [person, setPerson] = useState(defaultPerson);
  const [color, setColor] = useState(COLORS[Math.floor(Math.random() * 8)]);
  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(newProject(name.trim().slice(0, 80), color, person));
  };
  return (
    <form className="stack new-project" onSubmit={submit}>
      <label className="field">
        <span className="label">Nome do projeto</span>
        <input autoFocus={autoFocus} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Meu jogo, TCC, Loja" maxLength={80} />
      </label>
      <label className="field">
        <span className="label">Seu nome (opcional)</span>
        <input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Para marcar as tarefas que são suas" maxLength={40} />
      </label>
      <div className="field">
        <span className="label">Cor</span>
        <ColorDots colors={COLORS} value={color} onChange={setColor} />
      </div>
      <button className="btn primary big" type="submit" disabled={!name.trim()}>
        <Icon name="plus" size={18} /> {submitLabel}
      </button>
    </form>
  );
}

export function NewProjectDialog({ onClose, onCreate, defaultPerson }) {
  return (
    <Modal title="Novo projeto" onClose={onClose}>
      <NewProjectForm
        defaultPerson={defaultPerson}
        onCreate={(r) => {
          onCreate(r);
          onClose();
        }}
      />
    </Modal>
  );
}

export function Welcome({ onCreate, onJoin, toast }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const join = async (e) => {
    e.preventDefault();
    const c = normalizeCode(code);
    if (!c) return toast("Código inválido. Formato: SK-XXXX-XXXX", "warn");
    setBusy(true);
    try {
      await onJoin(c);
    } catch (err) {
      toast(err.offline ? "Sem conexão com o servidor" : err.status === 404 ? "Não achei um quadro com esse código" : err.message, "warn");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-head">
          <Logo size={48} />
          <h1>S'Kitty</h1>
          <p className="muted">Organize projetos em colunas, com prazos claros e quem está com cada tarefa.</p>
        </div>
        <NewProjectForm onCreate={onCreate} submitLabel="Criar meu primeiro projeto" autoFocus={false} />
        <div className="divider">
          <span>ou entre num quadro compartilhado</span>
        </div>
        <form className="inline-add" onSubmit={join}>
          <input className="code-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="SK-XXXX-XXXX" />
          <button className="btn" type="submit" disabled={busy}>
            <Icon name="login" size={16} /> Entrar
          </button>
        </form>
      </div>
    </div>
  );
}

// ===========================================================================
// COMPARTILHAR
// ===========================================================================

export function ShareDialog({ board, store, onClose, toast, onJoined }) {
  const [busy, setBusy] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const link = board.code ? `${siteUrl()}/?entrar=${board.code}` : "";

  const share = async () => {
    setBusy(true);
    try {
      const res = await api.createShared(board);
      store.replaceBoard(board.id, { ...res.board, id: board.id }, { version: res.version, dirty: false });
      toast("Quadro compartilhado");
    } catch (err) {
      toast(err.offline ? "Sem conexão com o servidor. Verifique a internet." : err.message, "warn");
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    const code = normalizeCode(joinCode);
    if (!code) return toast("Código inválido. Formato: SK-XXXX-XXXX", "warn");
    setBusy(true);
    try {
      await onJoined(code);
      onClose();
    } catch (err) {
      toast(err.offline ? "Sem conexão com o servidor. Verifique a internet." : err.status === 404 ? "Não achei um quadro com esse código" : err.message, "warn");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Trabalhar junto" onClose={onClose}>
      {board.code ? (
        <section className="share-box">
          <p className="muted">Quem tiver este código vê e edita o quadro em tempo real.</p>
          <div className="code-big">{board.code}</div>
          <div className="row">
            <button className="btn primary" onClick={async () => (await copyText(board.code)) && toast("Código copiado")}>
              <Icon name="copy" size={16} /> Copiar código
            </button>
            <button className="btn" onClick={async () => (await copyText(link)) && toast("Link copiado")}>
              <Icon name="link" size={16} /> Copiar link
            </button>
          </div>
          <button
            className="btn ghost danger small"
            onClick={() => {
              if (!window.confirm("Parar de sincronizar neste aparelho? O quadro continua salvo aqui, mas desligado dos outros.")) return;
              store.replaceBoard(board.id, { ...board, code: null }, { version: 0, dirty: false });
              toast("Este aparelho saiu do quadro compartilhado");
            }}
          >
            Desligar deste aparelho
          </button>
        </section>
      ) : (
        <section className="share-box">
          <p className="muted">Gere um código para este quadro. Mande para quem vai trabalhar junto, ou use no celular.</p>
          <button className="btn primary big" onClick={share} disabled={busy}>
            <Icon name="share" size={18} /> {busy ? "Gerando..." : "Gerar código"}
          </button>
        </section>
      )}

      <div className="divider">
        <span>ou entre num quadro existente</span>
      </div>
      <div className="inline-add">
        <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && join()} placeholder="SK-XXXX-XXXX" className="code-input" />
        <button className="btn" onClick={join} disabled={busy}>
          <Icon name="login" size={16} /> Entrar
        </button>
      </div>
    </Modal>
  );
}

// ===========================================================================
// IA
// ===========================================================================

const AI_SITES = [
  { name: "ChatGPT", url: "https://chatgpt.com/" },
  { name: "Claude", url: "https://claude.ai/new" },
  { name: "Gemini", url: "https://gemini.google.com/app" },
];

function chatPrompt(board) {
  return [
    "Você é meu assistente de produção e organização de projetos.",
    "Abaixo está o meu quadro de tarefas atual (S'Kitty).",
    "",
    "Quando eu pedir tarefas novas, responda com uma lista que eu possa colar de volta no quadro, neste formato exato:",
    "## Nome da coluna",
    "- Título curto da tarefa #Etiqueta @Pessoa !alta prazo:AAAA-MM-DD",
    "",
    "Etiqueta, pessoa, prioridade (!baixa, !media, !alta) e prazo são opcionais. Divida trabalhos grandes em tarefas de no máximo 2 horas.",
    "",
    "---",
    boardToMarkdown(board, { ids: false }),
  ].join("\n");
}

function agentPrompt(board) {
  const base = apiBase();
  return [
    `Você tem acesso ao meu quadro de tarefas S'Kitty pela API HTTP em ${base}`,
    `Código do quadro: ${board.code}`,
    "",
    "Como usar (JSON, sem autenticação; o código é a chave):",
    `- Ler o quadro em texto: GET ${base}/boards/${board.code}?format=md`,
    `- Mudar nome ou prazo do projeto: PATCH ${base}/boards/${board.code}  {"due": "2026-12-20"}`,
    `- Criar tarefa: POST ${base}/boards/${board.code}/cards  {"title": "...", "column": "A fazer", "tags": ["Arte"], "assignees": ["Gui"], "priority": 2, "due": "2026-12-01", "checklist": ["passo 1"], "links": ["https://..."]}`,
    `- Editar ou mover: PATCH ${base}/boards/${board.code}/cards/ID  {"column": "Feito"} (envie só o que muda; "done": true move para concluídas)`,
    `- Apagar: DELETE ${base}/boards/${board.code}/cards/ID`,
    `- Criar várias de uma vez: POST ${base}/boards/${board.code}/import  {"text": "## A fazer\\n- Tarefa #Arte @Gui !alta prazo:2026-12-01"}`,
    "",
    "Sempre leia o quadro antes de editar. Os ids das tarefas aparecem como [id: ...] no texto.",
  ].join("\n");
}

export function AiDialog({ board, update, onClose, toast, onShare }) {
  const [tab, setTab] = useState("chat");
  const [reply, setReply] = useState("");
  const tasks = useMemo(() => parseTaskList(reply), [reply]);

  const importTasks = () => {
    if (!tasks.length) return;
    update((b) => {
      let next = b;
      for (const t of tasks) {
        if (t.column && !findColumn(next, t.column)) next = addColumn(next, t.column, COLORS[Object.keys(next.columns).length % COLORS.length]).board;
        const col = t.column ? findColumn(next, t.column) : null;
        const tg = resolveTags(next, t.tags);
        const pp = resolveMembers(tg.board, t.people);
        next = addCard(pp.board, { title: t.title, tags: tg.ids, assignees: pp.ids, priority: t.priority, due: t.due, ...(col ? { columnId: col.id } : {}) }).board;
      }
      return next;
    });
    toast(`${tasks.length} ${tasks.length === 1 ? "tarefa criada" : "tarefas criadas"}`);
    setReply("");
  };

  return (
    <Modal title="Integração com IA" onClose={onClose} size="lg">
      <div className="tabs">
        <button className={tab === "chat" ? "on" : ""} onClick={() => setTab("chat")}>
          Conversar com uma IA
        </button>
        <button className={tab === "agent" ? "on" : ""} onClick={() => setTab("agent")}>
          Agentes e API
        </button>
      </div>

      {tab === "chat" ? (
        <div className="stack">
          <ol className="steps">
            <li>
              <strong>Copie o contexto.</strong> Vai o quadro inteiro e as instruções de formato.
              <div className="row">
                <button className="btn primary" onClick={async () => (await copyText(chatPrompt(board))) && toast("Contexto copiado")}>
                  <Icon name="copy" size={16} /> Copiar contexto
                </button>
              </div>
            </li>
            <li>
              <strong>Cole na IA que preferir</strong> e peça o que quiser: dividir tarefas, planejar a semana, sugerir prazos.
              <div className="row">
                {AI_SITES.map((s) => (
                  <a key={s.name} className="btn" href={s.url} target="_blank" rel="noreferrer noopener">
                    {s.name} <Icon name="external" size={14} />
                  </a>
                ))}
              </div>
            </li>
            <li>
              <strong>Cole a resposta aqui</strong> para virar tarefas.
              <textarea rows={7} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={"## A fazer\n- Desenhar o inimigo melee #Arte @Gui !alta prazo:2026-12-01"} />
              <div className="row">
                <button className="btn primary" disabled={!tasks.length} onClick={importTasks}>
                  {tasks.length ? `Criar ${tasks.length} ${tasks.length === 1 ? "tarefa" : "tarefas"}` : "Nenhuma tarefa reconhecida"}
                </button>
              </div>
            </li>
          </ol>
        </div>
      ) : board.code ? (
        <div className="stack">
          <p className="muted">
            Agentes como o Claude Code, um GPT personalizado do ChatGPT ou o Gemini com ferramentas podem ler e editar este quadro direto pela API.
          </p>
          <div className="kv">
            <span>Código</span>
            <code>{board.code}</code>
            <span>API</span>
            <code>{apiBase()}</code>
            <span>OpenAPI</span>
            <code>{apiBase()}/openapi.json</code>
          </div>
          <div className="row">
            <button className="btn primary" onClick={async () => (await copyText(agentPrompt(board))) && toast("Instruções copiadas")}>
              <Icon name="copy" size={16} /> Copiar instruções para o agente
            </button>
            <button className="btn" onClick={async () => (await copyText(`${apiBase()}/openapi.json`)) && toast("Endereço copiado")}>
              <Icon name="link" size={16} /> Copiar OpenAPI
            </button>
          </div>
          <details className="howto">
            <summary>Como ligar no ChatGPT (GPT personalizado)</summary>
            <ol>
              <li>No ChatGPT, crie um GPT e abra "Configurar", depois "Criar nova ação".</li>
              <li>Em "Importar de URL", cole o endereço do OpenAPI acima.</li>
              <li>Nas instruções do GPT, cole as instruções do agente (botão acima).</li>
            </ol>
          </details>
          <details className="howto">
            <summary>Como usar com o Claude Code</summary>
            <p>Cole as instruções do agente na conversa. O Claude Code usa a API com requisições HTTP.</p>
          </details>
        </div>
      ) : (
        <div className="stack center">
          <p className="muted">Para um agente acessar o quadro pela API, ele precisa estar compartilhado (com código).</p>
          <button className="btn primary" onClick={onShare}>
            <Icon name="share" size={16} /> Compartilhar quadro
          </button>
        </div>
      )}
    </Modal>
  );
}

// ===========================================================================
// AJUSTES
// ===========================================================================

function isoIn(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ProjectDeadline({ board, update }) {
  const info = projectDueInfo(board);
  const { done, total } = projectProgress(board);
  const setDue = (due) => update((b) => touchMeta(b, { due }));
  return (
    <div className="field">
      {info && <div className={`due-banner ${info.tone}`}>{info.label}</div>}
      <input type="date" value={board.meta.due || ""} onChange={(e) => setDue(e.target.value)} />
      <div className="chips">
        <button className="chip-btn" onClick={() => setDue(isoIn(7))}>
          1 semana
        </button>
        <button className="chip-btn" onClick={() => setDue(isoIn(14))}>
          2 semanas
        </button>
        <button className="chip-btn" onClick={() => setDue(isoIn(30))}>
          1 mês
        </button>
        <button className="chip-btn" onClick={() => setDue(isoIn(90))}>
          3 meses
        </button>
        {board.meta.due && (
          <button className="chip-btn" onClick={() => setDue("")}>
            Sem prazo
          </button>
        )}
      </div>
      <p className="muted small">
        {done} de {total} tarefas concluídas
        {info && info.days > 0 && total > done ? `. Faltam ${total - done} em ${info.days} ${info.days === 1 ? "dia" : "dias"}.` : "."}
      </p>
    </div>
  );
}

function Section({ title, hint, children, danger }) {
  return (
    <section className={`set-section ${danger ? "danger" : ""}`}>
      {title && <h3 className="set-title">{title}</h3>}
      {hint && <p className="set-hint">{hint}</p>}
      <div className="set-body">{children}</div>
    </section>
  );
}

function Stepper({ value, min = 0, max = 99, onChange, zeroLabel }) {
  return (
    <div className="stepper big">
      <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label="Diminuir">
        -
      </button>
      <span>{value === 0 && zeroLabel ? zeroLabel : value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Aumentar">
        +
      </button>
    </div>
  );
}

function Toggle({ checked, onChange, children }) {
  return (
    <label className="toggle-row">
      <span>{children}</span>
      <input type="checkbox" className="toggle-input" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-ui" aria-hidden="true" />
    </label>
  );
}

/** Linha de lista que abre ao tocar e mostra as opcoes do item. */
function EditRow({ open, onToggle, lead, title, meta, children }) {
  return (
    <li className={`erow ${open ? "open" : ""}`}>
      <button className="erow-head" onClick={onToggle} aria-expanded={open}>
        {lead}
        <span className="erow-title">{title}</span>
        {meta}
        <Icon name="right" size={18} className="chev" />
      </button>
      {open && <div className="erow-body">{children}</div>}
    </li>
  );
}

function NameField({ value, onSave, label = "Nome" }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      <input
        defaultValue={value}
        key={value}
        onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== value && onSave(e.target.value.trim())}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </label>
  );
}

function AddRow({ placeholder, onAdd }) {
  const [value, setValue] = useState("");
  const submit = (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    onAdd(value.trim());
    setValue("");
  };
  return (
    <form className="add-row" onSubmit={submit}>
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} />
      <button className="btn primary" type="submit" disabled={!value.trim()} aria-label="Adicionar">
        <Icon name="plus" size={18} />
      </button>
    </form>
  );
}

export function SettingsDialog({ board, store, update, onClose, toast, me }) {
  const [tab, setTab] = useState("projeto");
  const [openId, setOpenId] = useState(null);
  const { state, setPrefs, setMe, removeBoard, addBoard } = store;
  const prefs = state.prefs;
  const columns = liveColumns(board);
  const members = liveMembers(board);
  const toggle = (id) => setOpenId((cur) => (cur === id ? null : id));

  const exportJson = async () => {
    try {
      const how = await saveText(JSON.stringify(board, null, 2), `${safeFileName(board.meta.name, "quadro")}.skitty.json`, "application/json");
      if (how === "baixado") toast("Backup baixado");
    } catch {
      toast("Não consegui salvar o backup", "warn");
    }
  };

  const importJson = async (file) => {
    try {
      const data = sanitizeBoard(JSON.parse(await file.text()));
      addBoard({ ...data, id: uid("brd_"), code: null });
      toast("Projeto importado");
      onClose();
    } catch {
      toast("Arquivo inválido", "warn");
    }
  };

  const setTags = (tags) => update((b) => touchSettings(b, { tags }));
  const editTag = (id, patch) => setTags(board.settings.tags.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const deleteColumn = (c) => {
    const cards = cardsIn(board, c.id);
    if (!window.confirm(cards.length ? `Apagar a coluna "${c.name}" e as ${cards.length} tarefas dela?` : `Apagar a coluna "${c.name}"?`)) return;
    update((b) => {
      let next = touchColumn(b, c.id, { deleted: true });
      for (const card of cards) next = touchCard(next, card.id, { deleted: true });
      return next;
    });
    setOpenId(null);
  };

  return (
    <Modal title="Ajustes do projeto" onClose={onClose} size="md">
      <div className="tabs">
        {[
          ["projeto", "Projeto"],
          ["colunas", "Colunas"],
          ["etiquetas", "Etiquetas"],
          ["pessoas", "Pessoas"],
          ["aparencia", "Visual"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "on" : ""}
            onClick={() => {
              setTab(id);
              setOpenId(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "projeto" && (
        <div className="stack">
          <Section title="Geral">
            <NameField value={board.meta.name} label="Nome do projeto" onSave={(name) => update((b) => touchMeta(b, { name }))} />
            <div className="field">
              <span className="label">Cor</span>
              <ColorDots colors={COLORS} value={board.meta.color} onChange={(color) => update((b) => touchMeta(b, { color }))} />
            </div>
          </Section>
          <Section title="Prazo">
            <ProjectDeadline board={board} update={update} />
          </Section>
          <Section title="Meta da semana" hint="Quantas tarefas você quer concluir por semana.">
            <Stepper value={board.settings.weeklyGoal} max={500} onChange={(weeklyGoal) => update((b) => touchSettings(b, { weeklyGoal }))} />
          </Section>
          <Section title="Backup" hint="Salve uma cópia do projeto num arquivo, ou abra uma cópia salva.">
            <div className="btn-grid">
              <button className="btn" onClick={exportJson}>
                <Icon name="download" size={16} /> Exportar
              </button>
              <label className="btn">
                <Icon name="upload" size={16} /> Importar
                <input type="file" accept=".json,application/json" hidden onChange={(e) => e.target.files[0] && importJson(e.target.files[0])} />
              </label>
            </div>
          </Section>
          <Section danger>
            <button
              className="btn ghost danger wide"
              onClick={() => {
                if (!window.confirm(`Apagar o projeto "${board.meta.name}" deste aparelho?${board.code ? " Quem tem o código continua com ele." : ""}`)) return;
                removeBoard(board.id);
                onClose();
              }}
            >
              <Icon name="trash" size={16} /> Apagar projeto deste aparelho
            </button>
          </Section>
        </div>
      )}

      {tab === "colunas" && (
        <div className="stack">
          <p className="set-hint">Toque numa coluna para mudar nome, cor, limite e ordem.</p>
          <ul className="erow-list">
            {columns.map((c, i) => (
              <EditRow
                key={c.id}
                open={openId === c.id}
                onToggle={() => toggle(c.id)}
                lead={<span className="swatch" style={{ background: c.color }} />}
                title={c.name}
                meta={
                  <span className="erow-meta">
                    {c.done && <span className="pill ok">Concluídas</span>}
                    {c.wip > 0 && <span className="pill">Limite {c.wip}</span>}
                  </span>
                }
              >
                <NameField value={c.name} onSave={(name) => update((b) => touchColumn(b, c.id, { name }))} />
                <div className="field">
                  <span className="label">Cor</span>
                  <ColorDots colors={COLORS} value={c.color} onChange={(color) => update((b) => touchColumn(b, c.id, { color }))} />
                </div>
                <div className="field">
                  <span className="label">Limite de tarefas ao mesmo tempo</span>
                  <Stepper value={c.wip} onChange={(wip) => update((b) => touchColumn(b, c.id, { wip }))} zeroLabel="Sem limite" />
                </div>
                <Toggle checked={c.done} onChange={(done) => update((b) => touchColumn(b, c.id, { done }))}>
                  Tarefas aqui contam como concluídas
                </Toggle>
                <div className="btn-grid three">
                  <button className="btn" disabled={i === 0} onClick={() => update((b) => shiftColumn(b, c.id, -1))}>
                    <Icon name="left" size={16} /> Antes
                  </button>
                  <button className="btn" disabled={i === columns.length - 1} onClick={() => update((b) => shiftColumn(b, c.id, 1))}>
                    Depois <Icon name="right" size={16} />
                  </button>
                  <button className="btn danger" onClick={() => deleteColumn(c)}>
                    <Icon name="trash" size={16} /> Apagar
                  </button>
                </div>
              </EditRow>
            ))}
          </ul>
          <AddRow placeholder="Nova coluna" onAdd={(name) => update((b) => addColumn(b, name, COLORS[columns.length % COLORS.length]).board)} />
        </div>
      )}

      {tab === "etiquetas" && (
        <div className="stack">
          <p className="set-hint">Toque numa etiqueta para mudar nome e cor.</p>
          <ul className="erow-list">
            {board.settings.tags.map((t) => (
              <EditRow key={t.id} open={openId === t.id} onToggle={() => toggle(t.id)} lead={<span className="tag" style={{ "--tag": t.color }}>{t.name}</span>} title="">
                <NameField value={t.name} onSave={(name) => editTag(t.id, { name })} />
                <div className="field">
                  <span className="label">Cor</span>
                  <ColorDots colors={COLORS} value={t.color} onChange={(color) => editTag(t.id, { color })} />
                </div>
                <button
                  className="btn ghost danger wide"
                  onClick={() => {
                    if (!window.confirm(`Apagar a etiqueta "${t.name}"?`)) return;
                    setTags(board.settings.tags.filter((x) => x.id !== t.id));
                    setOpenId(null);
                  }}
                >
                  <Icon name="trash" size={16} /> Apagar etiqueta
                </button>
              </EditRow>
            ))}
          </ul>
          <AddRow placeholder="Nova etiqueta" onAdd={(name) => update((b) => resolveTags(b, [name]).board)} />
        </div>
      )}

      {tab === "pessoas" && (
        <div className="stack">
          <p className="set-hint">Quem trabalha neste projeto. Marque quem é você neste aparelho para usar o filtro "Minhas".</p>
          <ul className="erow-list">
            {members.map((m) => (
              <EditRow
                key={m.id}
                open={openId === m.id}
                onToggle={() => toggle(m.id)}
                lead={<Avatar member={m} size={30} />}
                title={m.name}
                meta={me === m.id ? <span className="pill accent">Você</span> : null}
              >
                <NameField value={m.name} onSave={(name) => update((b) => touchMember(b, m.id, { name }))} />
                <div className="field">
                  <span className="label">Cor</span>
                  <ColorDots colors={COLORS} value={m.color} onChange={(color) => update((b) => touchMember(b, m.id, { color }))} />
                </div>
                <Toggle checked={me === m.id} onChange={(on) => setMe(board.id, on ? m.id : null)}>
                  Sou eu neste aparelho
                </Toggle>
                <button
                  className="btn ghost danger wide"
                  onClick={() => {
                    if (!window.confirm(`Remover ${m.name} do projeto?`)) return;
                    update((b) => touchMember(b, m.id, { deleted: true }));
                    setOpenId(null);
                  }}
                >
                  <Icon name="trash" size={16} /> Remover pessoa
                </button>
              </EditRow>
            ))}
          </ul>
          <AddRow placeholder="Nome da pessoa" onAdd={(name) => update((b) => addMember(b, name).board)} />
        </div>
      )}

      {tab === "aparencia" && (
        <div className="stack">
          <Section title="Tema">
            <div className="segmented">
              <button className={prefs.theme === "light" ? "on" : ""} onClick={() => setPrefs({ theme: "light" })}>
                <Icon name="sun" size={15} /> Claro
              </button>
              <button className={prefs.theme === "dark" ? "on" : ""} onClick={() => setPrefs({ theme: "dark" })}>
                <Icon name="moon" size={15} /> Escuro
              </button>
            </div>
          </Section>
          <Section title="Cor de destaque">
            <ColorDots colors={COLORS} value={prefs.accent} onChange={(accent) => setPrefs({ accent })} />
          </Section>
          <Section title="Cartões">
            <Toggle checked={prefs.compact} onChange={(compact) => setPrefs({ compact })}>
              Cartões compactos
            </Toggle>
            <Toggle checked={prefs.showDesc} onChange={(showDesc) => setPrefs({ showDesc })}>
              Mostrar trecho da descrição
            </Toggle>
          </Section>
        </div>
      )}
    </Modal>
  );
}
