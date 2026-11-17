import { useCallback, useEffect, useState } from "react";
import { boardToMarkdown, liveMembers, projectDueInfo, projectProgress, uid, weeklyDoneCount } from "../shared/model.js";
import { api, isNativeApp } from "./api.js";
import { useStore } from "./useStore.js";
import { useSync } from "./useSync.js";
import { Board } from "./components/Board.jsx";
import { CardModal } from "./components/CardModal.jsx";
import { AiDialog, NewProjectDialog, SettingsDialog, ShareDialog, Welcome } from "./components/Dialogs.jsx";
import { Avatar, copyText, Icon, Logo, Menu, MenuItem, useToast } from "./components/ui.jsx";
import { safeFileName, saveText } from "./files.js";

const STATUS = {
  local: { icon: "device", text: "Salvo neste aparelho" },
  syncing: { icon: "refresh", text: "Sincronizando" },
  ok: { icon: "cloud", text: "Sincronizado" },
  offline: { icon: "cloudOff", text: "Sem conexão" },
  error: { icon: "alert", text: "Erro ao sincronizar" },
};

const EMPTY_FILTER = { q: "", tag: "", person: "", late: false };

export default function App() {
  const store = useStore();
  const { state, set, updateBoard, addBoard, setPrefs, setMe } = store;
  const board = state.boards[state.activeId];
  const sync = useSync(store);
  const toast = useToast();
  const [dialog, setDialog] = useState(null); // share | ai | settings
  const [openCard, setOpenCard] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filter, setFilter] = useState(EMPTY_FILTER);
  const me = board ? state.me?.[board.id] : null;

  const update = useCallback((fn) => updateBoard(state.activeId, fn), [updateBoard, state.activeId]);

  useEffect(() => {
    document.documentElement.dataset.theme = state.prefs.theme;
    document.documentElement.style.setProperty("--accent", state.prefs.accent);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", state.prefs.theme === "dark" ? "#0f1015" : "#f5f6fa");
  }, [state.prefs.theme, state.prefs.accent]);

  useEffect(() => {
    setFilter(EMPTY_FILTER);
    setFiltersOpen(false);
  }, [state.activeId]);

  const joinByCode = useCallback(
    async (code) => {
      const existing = Object.values(store.ref.current.boards).find((b) => b.code === code);
      if (existing) {
        set((s) => ({ ...s, activeId: existing.id }));
        return;
      }
      const res = await api.get(code);
      addBoard({ ...res.board, id: uid("brd_"), code }, { version: res.version, dirty: false });
      toast.show("Você entrou no quadro");
    },
    [addBoard, set, store.ref, toast]
  );

  // Link de convite: /?entrar=SK-XXXX-XXXX
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("entrar");
    if (!code) return;
    window.history.replaceState(null, "", window.location.pathname);
    joinByCode(code).catch((err) => toast.show(err.offline ? "Sem conexão com o servidor" : "Não achei esse quadro", "warn"));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Atalhos: "/" busca, "n" nova tarefa
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest("input, textarea, select") || dialog || openCard) return;
      if (e.key === "/") {
        e.preventDefault();
        document.getElementById("search")?.focus();
      }
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        document.querySelector(".column:nth-child(2) .quick-add-btn, .column .quick-add-btn")?.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, openCard]);

  const createProject = ({ board: b, me: meId }) => {
    addBoard(b);
    if (meId) setMe(b.id, meId);
    setDrawer(false);
  };

  if (!board) {
    return (
      <>
        <Welcome onCreate={createProject} onJoin={joinByCode} toast={toast.show} />
        {toast.node}
      </>
    );
  }
  const members = liveMembers(board);
  const done = weeklyDoneCount(board);
  const goal = board.settings.weeklyGoal || 0;
  const status = STATUS[sync.status];
  const projectDue = projectDueInfo(board);
  const progress = projectProgress(board);
  const progressPct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const activeFilters = [filter.tag, filter.person, filter.late].filter(Boolean).length;

  const myName = me ? board.members?.[me]?.name || "" : "";
  const newProject = () => {
    setDrawer(false);
    setDialog("new");
  };

  const contextText = () => boardToMarkdown(board, { ids: false });
  const copyContext = async () => {
    if (await copyText(contextText())) toast.show("Contexto do projeto copiado");
    else toast.show("Não consegui copiar", "warn");
  };
  const downloadContext = async () => {
    try {
      const how = await saveText(contextText(), `${safeFileName(board.meta.name, "projeto")}-contexto.md`);
      if (how === "baixado") toast.show("Arquivo baixado");
    } catch {
      toast.show("Não consegui salvar o arquivo", "warn");
    }
  };

  const toggleFilter = (key, value) => setFilter((f) => ({ ...f, [key]: f[key] === value ? EMPTY_FILTER[key] : value }));

  return (
    <div className="app">
      <aside className={`sidebar ${drawer ? "open" : ""}`} aria-label="Projetos">
        <div className="brand">
          <Logo />
          <span>S'Kitty</span>
          <button className="icon-btn compact-only" onClick={() => setDrawer(false)} aria-label="Fechar menu">
            <Icon name="x" />
          </button>
        </div>
        <span className="side-label">Projetos</span>
        <nav className="projects">
          {state.order.map((id) => {
            const b = state.boards[id];
            const count = Object.values(b.cards).filter((c) => !c.deleted).length;
            const pDue = projectDueInfo(b);
            return (
              <button
                key={id}
                className={`project ${id === state.activeId ? "active" : ""}`}
                onClick={() => {
                  set((s) => ({ ...s, activeId: id }));
                  setDrawer(false);
                }}
              >
                <span className="project-dot" style={{ background: b.meta.color }} />
                <span className="grow">{b.meta.name}</span>
                {b.code && <Icon name="users" size={14} className="muted-icon" />}
                {pDue ? (
                  <span className={`project-due ${pDue.tone}`} title={pDue.label}>
                    {pDue.tone === "late" ? "Atrasado" : pDue.short}
                  </span>
                ) : (
                  <span className="project-count">{count}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="side-actions">
          <button className="btn ghost wide" onClick={newProject}>
            <Icon name="plus" size={16} /> Novo projeto
          </button>
          <button
            className="btn ghost wide"
            onClick={() => {
              setDialog("share");
              setDrawer(false);
            }}
          >
            <Icon name="login" size={16} /> Entrar com código
          </button>
          {!isNativeApp() && (
            <a className="btn ghost wide" href="/SKitty.apk" download>
              <Icon name="device" size={16} /> Baixar app Android
            </a>
          )}
        </div>
        <div className="side-foot">
          <button className="icon-btn" onClick={() => setPrefs({ theme: state.prefs.theme === "dark" ? "light" : "dark" })} aria-label="Trocar tema">
            <Icon name={state.prefs.theme === "dark" ? "sun" : "moon"} />
          </button>
          <span className="muted small">
            Semana: {done} de {goal} concluídas
          </span>
        </div>
      </aside>
      {drawer && <div className="scrim" onClick={() => setDrawer(false)} />}

      <main className="main">
        <header className="topbar">
          <button className="icon-btn compact-only" onClick={() => setDrawer(true)} aria-label="Abrir menu">
            <Icon name="menu" />
          </button>
          <div className="title-block">
            <h1>
              <span className="project-dot big" style={{ background: board.meta.color }} />
              <span className="title-text">{board.meta.name}</span>
            </h1>
            <button className={`subline ${projectDue ? projectDue.tone : "none"}`} onClick={() => setDialog("settings")} title="Prazo e progresso do projeto">
              <Icon name="calendar" size={13} />
              <span className="sub-due">{projectDue ? projectDue.label : "Definir prazo"}</span>
              <span className="sep" />
              <span>
                {progress.done} de {progress.total} concluídas
              </span>
            </button>
          </div>
          <span className={`sync ${sync.status}`} title={sync.lastError || status.text} aria-label={status.text}>
            <Icon name={status.icon} size={16} />
          </span>
          <div className="actions">
            <button className="btn" onClick={() => setDialog("share")} aria-label="Compartilhar">
              <Icon name="share" size={16} />
              <span className="wide-only">{board.code || "Compartilhar"}</span>
            </button>
            <button className="btn" onClick={() => setDialog("ai")} aria-label="Integração com IA">
              <Icon name="sparkles" size={16} />
              <span className="wide-only">IA</span>
            </button>
            <Menu
              trigger={({ toggle }) => (
                <button className="btn icon" onClick={toggle} aria-label="Mais opções">
                  <Icon name="more" size={18} />
                </button>
              )}
            >
              <MenuItem icon="sliders" onClick={() => setDialog("settings")}>
                Ajustes do projeto
              </MenuItem>
              <MenuItem icon="copy" onClick={copyContext}>
                Copiar contexto do projeto
              </MenuItem>
              <MenuItem icon="download" onClick={downloadContext}>
                Baixar contexto (.md)
              </MenuItem>
            </Menu>
          </div>
          <div className="header-progress" aria-hidden="true">
            <span style={{ width: `${progressPct}%` }} />
          </div>
        </header>

        <div className="filters">
          <label className="search">
            <Icon name="search" size={16} />
            <input id="search" placeholder="Buscar tarefas" value={filter.q} onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))} />
            {filter.q && (
              <button className="icon-btn tiny" onClick={() => setFilter((f) => ({ ...f, q: "" }))} aria-label="Limpar busca">
                <Icon name="x" size={14} />
              </button>
            )}
          </label>
          <button className={`chip-btn filters-toggle ${filtersOpen || activeFilters ? "on" : ""}`} onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
            <Icon name="sliders" size={14} /> Filtros{activeFilters ? ` (${activeFilters})` : ""}
          </button>
          <div className={`filter-extra ${filtersOpen ? "open" : ""}`}>
            {me && (
              <button className={`chip-btn ${filter.person === me ? "on" : ""}`} onClick={() => toggleFilter("person", me)}>
                <Icon name="user" size={14} /> Minhas
              </button>
            )}
            <button className={`chip-btn ${filter.late ? "on warn" : ""}`} onClick={() => toggleFilter("late", true)}>
              <Icon name="calendar" size={14} /> Atrasadas e de hoje
            </button>
            {members.length > 0 && (
              <div className="people-filter">
                {members.map((m) => (
                  <button key={m.id} className={`avatar-btn ${filter.person === m.id ? "on" : ""}`} onClick={() => toggleFilter("person", m.id)} title={m.name} aria-label={`Tarefas de ${m.name}`}>
                    <Avatar member={m} size={28} />
                  </button>
                ))}
              </div>
            )}
            {board.settings.tags.length > 0 && (
              <select className="tag-select" value={filter.tag} onChange={(e) => setFilter((f) => ({ ...f, tag: e.target.value }))} aria-label="Filtrar por etiqueta">
                <option value="">Todas as etiquetas</option>
                {board.settings.tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
            {(activeFilters > 0 || filter.q) && (
              <button className="link-btn" onClick={() => setFilter(EMPTY_FILTER)}>
                Limpar filtros
              </button>
            )}
          </div>
        </div>

        <Board board={board} update={update} filter={filter} prefs={state.prefs} onOpenCard={setOpenCard} defaultAssignee={me} />
      </main>

      {openCard && <CardModal board={board} cardId={openCard} update={update} onClose={() => setOpenCard(null)} toast={toast.show} />}
      {dialog === "new" && <NewProjectDialog onClose={() => setDialog(null)} onCreate={createProject} defaultPerson={myName} />}
      {dialog === "share" && <ShareDialog board={board} store={store} onClose={() => setDialog(null)} toast={toast.show} onJoined={joinByCode} />}
      {dialog === "ai" && <AiDialog board={board} update={update} onClose={() => setDialog(null)} toast={toast.show} onShare={() => setDialog("share")} />}
      {dialog === "settings" && <SettingsDialog board={board} store={store} update={update} onClose={() => setDialog(null)} toast={toast.show} me={me} />}
      {toast.node}
    </div>
  );
}
