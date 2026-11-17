import { useEffect, useMemo, useRef, useState } from "react";
import {
  addCard,
  addColumn,
  cardsIn,
  COLORS,
  dueInfo,
  liveColumns,
  orderFor,
  parseTaskList,
  resolveMembers,
  resolveTags,
  shiftColumn,
  touchCard,
  touchColumn,
} from "../../shared/model.js";
import { noteTasks, plainText } from "../markdown.js";
import { Avatar, ColorDots, Icon, Menu, MenuItem, Modal } from "./ui.jsx";

const PRIORITY = ["", "Baixa", "Média", "Alta"];

/** Cria tarefas a partir de texto (uma por linha, com #etiqueta @pessoa !alta prazo:AAAA-MM-DD). */
export function addTasksFromText(update, text, columnId, defaultAssignee) {
  const tasks = parseTaskList(text);
  if (!tasks.length) return 0;
  update((b) => {
    let next = b;
    for (const t of tasks) {
      const tg = resolveTags(next, t.tags);
      const pp = resolveMembers(tg.board, t.people);
      const assignees = pp.ids.length ? pp.ids : defaultAssignee ? [defaultAssignee] : [];
      next = addCard(pp.board, { title: t.title, tags: tg.ids, assignees, priority: t.priority, due: t.due, columnId }).board;
    }
    return next;
  });
  return tasks.length;
}

export function Board({ board, update, filter, prefs, onOpenCard, defaultAssignee }) {
  const columns = liveColumns(board);
  const [drag, setDrag] = useState(null);
  const [drop, setDrop] = useState(null);
  const [activeCol, setActiveCol] = useState(columns[0]?.id);
  const [adding, setAdding] = useState(false);
  const scroller = useRef(null);
  const tagMap = useMemo(() => Object.fromEntries(board.settings.tags.map((t) => [t.id, t])), [board.settings.tags]);
  const memberMap = board.members || {};

  const matches = (card, isDone) => {
    if (filter.tag && !card.tags.includes(filter.tag)) return false;
    if (filter.person && !card.assignees.includes(filter.person)) return false;
    if (filter.late) {
      const info = dueInfo(card.due, isDone);
      if (!info || !["late", "today"].includes(info.tone)) return false;
    }
    if (filter.q) {
      const q = filter.q.toLowerCase();
      if (!card.title.toLowerCase().includes(q) && !card.desc.toLowerCase().includes(q)) return false;
    }
    return true;
  };

  const finishDrop = () => {
    if (drag && drop) {
      update((b) => touchCard(b, drag, { columnId: drop.columnId, order: orderFor(b, drop.columnId, drop.beforeId, drag) }));
    }
    setDrag(null);
    setDrop(null);
  };

  // Celular: descobre qual coluna esta na tela para destacar a aba certa.
  const columnKey = columns.map((c) => c.id).join(",");
  useEffect(() => {
    const root = scroller.current;
    if (!root || !("IntersectionObserver" in window)) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (best) setActiveCol(best.target.dataset.col);
      },
      { root, threshold: [0.55, 0.8] }
    );
    root.querySelectorAll(".column[data-col]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [columnKey]);

  useEffect(() => {
    document.querySelector(`.col-tab[data-col="${activeCol}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [activeCol]);

  const goTo = (id) => {
    const el = scroller.current?.querySelector(`.column[data-col="${id}"]`);
    if (el) {
      const pad = parseFloat(getComputedStyle(scroller.current).paddingLeft) || 0;
      scroller.current.scrollTo({ left: el.offsetLeft - pad, behavior: "smooth" });
    }
    setActiveCol(id);
  };

  const currentCol = columns.find((c) => c.id === activeCol) || columns[0];

  return (
    <div className="board-wrap">
      <nav className="col-tabs" aria-label="Colunas">
        {columns.map((col) => {
          const n = cardsIn(board, col.id).length;
          return (
            <button key={col.id} data-col={col.id} className={`col-tab ${col.id === currentCol?.id ? "on" : ""}`} style={{ "--col": col.color }} onClick={() => goTo(col.id)}>
              <span className="col-dot" />
              {col.name}
              <span className="col-tab-count">{n}</span>
            </button>
          );
        })}
      </nav>

    <div
      className="board"
      ref={scroller}
      onDragEnd={() => {
        setDrag(null);
        setDrop(null);
      }}
    >
      {columns.map((col, index) => (
        <Column
          key={col.id}
          col={col}
          index={index}
          total={columns.length}
          cards={cardsIn(board, col.id)}
          matches={(c) => matches(c, col.done)}
          tagMap={tagMap}
          memberMap={memberMap}
          prefs={prefs}
          update={update}
          drag={drag}
          drop={drop}
          setDrag={setDrag}
          setDrop={setDrop}
          finishDrop={finishDrop}
          onOpenCard={onOpenCard}
          defaultAssignee={defaultAssignee}
        />
      ))}
      <AddColumn update={update} />
    </div>

      {currentCol && (
        <button className="fab" onClick={() => setAdding(true)} aria-label={`Nova tarefa em ${currentCol.name}`}>
          <Icon name="plus" size={26} strokeWidth={2.4} />
        </button>
      )}
      {adding && currentCol && (
        <QuickAddSheet columns={columns} initialColumn={currentCol.id} update={update} defaultAssignee={defaultAssignee} onClose={() => setAdding(false)} />
      )}
    </div>
  );
}

function QuickAddSheet({ columns, initialColumn, update, defaultAssignee, onClose }) {
  const [text, setText] = useState("");
  const [columnId, setColumnId] = useState(initialColumn);
  const count = parseTaskList(text).length;
  const submit = () => {
    if (addTasksFromText(update, text, columnId, defaultAssignee)) onClose();
  };
  return (
    <Modal
      title="Nova tarefa"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={!count} onClick={submit}>
            {count > 1 ? `Adicionar ${count} tarefas` : "Adicionar"}
          </button>
        </>
      }
    >
      <textarea
        className="sheet-input"
        autoFocus
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && count <= 1) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="O que precisa ser feito?"
      />
      <div className="field">
        <span className="label">Coluna</span>
        <div className="move-chips">
          {columns.map((c) => (
            <button key={c.id} className={`move-chip ${c.id === columnId ? "on" : ""}`} style={{ "--col": c.color }} onClick={() => setColumnId(c.id)}>
              <span className="col-dot" />
              {c.name}
            </button>
          ))}
        </div>
      </div>
      <p className="hint">
        Dica: uma tarefa por linha. Use <code>#etiqueta</code> <code>@pessoa</code> <code>!alta</code> <code>prazo:2026-12-01</code>
      </p>
    </Modal>
  );
}

function Column({ col, index, total, cards, matches, tagMap, memberMap, prefs, update, drag, drop, setDrag, setDrop, finishDrop, onOpenCard, defaultAssignee }) {
  const [renaming, setRenaming] = useState(false);
  const over = col.wip > 0 && cards.length > col.wip;
  const visible = cards.filter(matches);
  const editCol = (patch) => update((b) => touchColumn(b, col.id, patch));

  return (
    <section className={`column ${over ? "over-wip" : ""}`} style={{ "--col": col.color }} data-col={col.id}>
      <header className="column-head">
        <span className="col-dot" />
        {renaming ? (
          <input
            className="col-rename"
            autoFocus
            defaultValue={col.name}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== col.name) editCol({ name });
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
          <h2 onDoubleClick={() => setRenaming(true)}>{col.name}</h2>
        )}
        <span className={`count ${over ? "warn" : ""}`} title={col.wip ? `Limite de ${col.wip} tarefas` : "Sem limite"}>
          {cards.length}
          {col.wip ? ` / ${col.wip}` : ""}
        </span>
        {col.done && (
          <span className="done-badge" title="Tarefas aqui contam como concluídas">
            <Icon name="check" size={14} />
          </span>
        )}
        <Menu
          trigger={({ toggle }) => (
            <button className="icon-btn" onClick={toggle} aria-label={`Opções da coluna ${col.name}`}>
              <Icon name="more" />
            </button>
          )}
        >
          <MenuItem icon="text" onClick={() => setRenaming(true)}>
            Renomear
          </MenuItem>
          <div className="menu-section">
            <span className="menu-label">Cor</span>
            <ColorDots colors={COLORS} value={col.color} onChange={(color) => editCol({ color })} />
          </div>
          <div className="menu-section">
            <span className="menu-label">Limite de tarefas</span>
            <div className="stepper">
              <button onClick={() => editCol({ wip: Math.max(0, col.wip - 1) })} aria-label="Diminuir limite">
                -
              </button>
              <span>{col.wip || "Sem limite"}</span>
              <button onClick={() => editCol({ wip: Math.min(99, col.wip + 1) })} aria-label="Aumentar limite">
                +
              </button>
            </div>
          </div>
          <MenuItem icon="check" onClick={() => editCol({ done: !col.done })} keepOpen>
            {col.done ? "Não é coluna de concluídas" : "Marcar como concluídas"}
          </MenuItem>
          {index > 0 && (
            <MenuItem icon="left" onClick={() => update((b) => shiftColumn(b, col.id, -1))}>
              Mover para a esquerda
            </MenuItem>
          )}
          {index < total - 1 && (
            <MenuItem icon="right" onClick={() => update((b) => shiftColumn(b, col.id, 1))}>
              Mover para a direita
            </MenuItem>
          )}
          <MenuItem
            icon="trash"
            danger
            onClick={() => {
              const msg = cards.length ? `Apagar a coluna "${col.name}" e as ${cards.length} tarefas dela?` : `Apagar a coluna "${col.name}"?`;
              if (!window.confirm(msg)) return;
              update((b) => {
                let next = touchColumn(b, col.id, { deleted: true });
                for (const c of cards) next = touchCard(next, c.id, { deleted: true });
                return next;
              });
            }}
          >
            Apagar coluna
          </MenuItem>
        </Menu>
      </header>
      {over && <p className="wip-warning">Passou do limite. Termine algo antes de puxar mais.</p>}

      <div
        className={`card-list ${drop?.columnId === col.id ? "drop-target" : ""}`}
        onDragOver={(e) => {
          if (!drag) return;
          e.preventDefault();
          if (e.target === e.currentTarget) setDrop({ columnId: col.id, beforeId: null });
        }}
        onDrop={(e) => {
          e.preventDefault();
          finishDrop();
        }}
      >
        {visible.map((card) => (
          <div key={card.id} className="card-slot">
            {drop?.columnId === col.id && drop.beforeId === card.id && <div className="drop-line" />}
            <CardTile
              card={card}
              tagMap={tagMap}
              memberMap={memberMap}
              prefs={prefs}
              isDone={col.done}
              dragging={drag === card.id}
              onOpen={() => onOpenCard(card.id)}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", card.id);
                setDrag(card.id);
              }}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                e.stopPropagation();
                const r = e.currentTarget.getBoundingClientRect();
                const after = e.clientY > r.top + r.height / 2;
                const idx = cards.findIndex((c) => c.id === card.id);
                const beforeId = after ? cards[idx + 1]?.id || null : card.id;
                if (drop?.columnId !== col.id || drop?.beforeId !== beforeId) setDrop({ columnId: col.id, beforeId });
              }}
            />
          </div>
        ))}
        {drop?.columnId === col.id && drop.beforeId === null && <div className="drop-line" />}
        {!visible.length && <p className="empty">{cards.length ? "Nada com esse filtro" : "Solte tarefas aqui"}</p>}
      </div>

      <QuickAdd columnId={col.id} update={update} defaultAssignee={defaultAssignee} />
    </section>
  );
}

export function CardTile({ card, tagMap, memberMap, prefs, isDone, dragging, onOpen, onDragStart, onDragOver }) {
  const due = dueInfo(card.due, isDone);
  const notes = useMemo(() => ({ text: plainText(card.desc), tasks: noteTasks(card.desc) }), [card.desc]);
  const checkTotal = card.checklist.length + notes.tasks.total;
  const checklistDone = card.checklist.filter((i) => i.done).length + notes.tasks.done;
  const people = card.assignees.map((id) => memberMap[id]).filter((m) => m && !m.deleted);
  const tags = card.tags.map((id) => tagMap[id]).filter(Boolean);
  const cover = !prefs.compact && card.images[0];

  return (
    <article
      className={`card prio-${card.priority} ${dragging ? "dragging" : ""} ${isDone ? "is-done" : ""} ${prefs.compact ? "compact" : ""} ${due ? `due-${due.tone}` : ""}`}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onClick={onOpen}
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
    >
      {cover && <img className="card-cover" src={cover.src} alt="" loading="lazy" draggable={false} />}
      {tags.length > 0 && (
        <div className="card-tags">
          {tags.map((t) => (
            <span key={t.id} className="tag" style={{ "--tag": t.color }}>
              {t.name}
            </span>
          ))}
        </div>
      )}
      <h3>{card.title}</h3>
      {prefs.showDesc && !prefs.compact && notes.text && <p className="card-desc">{notes.text}</p>}
      {(due || card.priority > 0 || checkTotal > 0 || card.links.length > 0 || card.images.length > 1 || people.length > 0) && (
        <footer className="card-foot">
          {due && (
            <span className={`due-pill ${due.tone}`} title={`Prazo: ${due.short}`}>
              <Icon name="calendar" size={13} />
              {due.label}
            </span>
          )}
          {card.priority > 0 && (
            <span className={`prio-pill p${card.priority}`} title={`Prioridade ${PRIORITY[card.priority]}`}>
              <Icon name="flag" size={13} />
              {PRIORITY[card.priority]}
            </span>
          )}
          {checkTotal > 0 && (
            <span className={`meta-pill ${checklistDone === checkTotal ? "ok" : ""}`}>
              <Icon name="checklist" size={13} />
              {checklistDone}/{checkTotal}
            </span>
          )}
          {card.links.length > 0 && (
            <span className="meta-pill">
              <Icon name="link" size={13} />
              {card.links.length}
            </span>
          )}
          {card.images.length > 1 && (
            <span className="meta-pill">
              <Icon name="image" size={13} />
              {card.images.length}
            </span>
          )}
          {people.length > 0 && (
            <span className="avatars">
              {people.slice(0, 3).map((m) => (
                <Avatar key={m.id} member={m} size={24} />
              ))}
              {people.length > 3 && <span className="avatar more">+{people.length - 3}</span>}
            </span>
          )}
        </footer>
      )}
    </article>
  );
}

function QuickAdd({ columnId, update, defaultAssignee }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const submit = (text) => addTasksFromText(update, text, columnId, defaultAssignee);

  if (!open) {
    return (
      <button className="quick-add-btn" onClick={() => setOpen(true)}>
        <Icon name="plus" size={16} /> Adicionar tarefa
      </button>
    );
  }
  return (
    <div className="quick-add">
      <textarea
        ref={ref}
        autoFocus
        rows={2}
        placeholder="O que precisa ser feito?"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit(e.currentTarget.value);
            e.currentTarget.value = "";
          }
          if (e.key === "Escape") setOpen(false);
        }}
        onPaste={(e) => {
          const text = e.clipboardData.getData("text");
          if (text.includes("\n")) {
            e.preventDefault();
            submit(text);
          }
        }}
      />
      <p className="hint">
        Atalhos: <code>#etiqueta</code> <code>@pessoa</code> <code>!alta</code> <code>prazo:2026-12-01</code>
      </p>
      <div className="row">
        <button
          className="btn primary small"
          onClick={() => {
            submit(ref.current.value);
            ref.current.value = "";
            ref.current.focus();
          }}
        >
          Adicionar
        </button>
        <button className="btn ghost small" onClick={() => setOpen(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function AddColumn({ update }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button className="add-column" onClick={() => setOpen(true)}>
        <Icon name="plus" size={16} /> Nova coluna
      </button>
    );
  }
  return (
    <div className="add-column open">
      <input
        autoFocus
        placeholder="Nome da coluna"
        onKeyDown={(e) => {
          if (e.key === "Enter" && e.currentTarget.value.trim()) {
            const name = e.currentTarget.value.trim();
            update((b) => addColumn(b, name, COLORS[Object.keys(b.columns).length % COLORS.length]).board);
            setOpen(false);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        onBlur={() => setOpen(false)}
      />
    </div>
  );
}
