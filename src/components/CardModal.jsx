import { useState } from "react";
import {
  addMember,
  COLORS,
  dueInfo,
  liveColumns,
  liveMembers,
  normalizeUrl,
  PRIORITIES,
  resolveTags,
  touchCard,
  uid,
} from "../../shared/model.js";
import { compressImage } from "../images.js";
import { ImageViewer } from "./ImageViewer.jsx";
import { NotesEditor } from "./Notes.jsx";
import { Avatar, Icon, Modal } from "./ui.jsx";

function isoIn(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function CardModal({ board, cardId, update, onClose, toast }) {
  const card = board.cards[cardId];
  const [newItem, setNewItem] = useState("");
  const [newLink, setNewLink] = useState("");
  const [newTag, setNewTag] = useState("");
  const [newPerson, setNewPerson] = useState("");
  const [viewer, setViewer] = useState(null);
  const [busy, setBusy] = useState(false);
  if (!card || card.deleted) return null;

  const patch = (fields) => update((b) => touchCard(b, cardId, fields));
  const columns = liveColumns(board);
  const members = liveMembers(board);
  const col = board.columns[card.columnId];
  const due = dueInfo(card.due, col?.done);

  const toggle = (field, id) => patch({ [field]: card[field].includes(id) ? card[field].filter((x) => x !== id) : [...card[field], id] });

  const addImages = async (files) => {
    const list = [...files].filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    if (card.images.length + list.length > 8) {
      toast("Limite de 8 imagens por tarefa", "warn");
      return;
    }
    setBusy(true);
    try {
      const imgs = [];
      for (const f of list) imgs.push({ id: uid("img_"), src: await compressImage(f) });
      update((b) => touchCard(b, cardId, { images: [...b.cards[cardId].images, ...imgs] }));
    } catch (err) {
      toast(err.message, "warn");
    } finally {
      setBusy(false);
    }
  };

  const addLink = () => {
    const raw = newLink.trim();
    if (!raw) return;
    const url = normalizeUrl(raw);
    if (/\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i.test(url)) {
      patch({ images: [...card.images, { id: uid("img_"), src: url }] });
    } else {
      patch({ links: [...card.links, { id: uid("lnk_"), url, title: "" }] });
    }
    setNewLink("");
  };

  const addItem = () => {
    const text = newItem.trim();
    if (!text) return;
    patch({ checklist: [...card.checklist, { id: uid("chk_"), text, done: false }] });
    setNewItem("");
  };

  const createTag = () => {
    const name = newTag.trim();
    if (!name) return;
    update((b) => {
      const r = resolveTags(b, [name]);
      const c = r.board.cards[cardId];
      return touchCard(r.board, cardId, { tags: [...new Set([...c.tags, ...r.ids])] });
    });
    setNewTag("");
  };

  const createPerson = () => {
    const name = newPerson.trim();
    if (!name) return;
    update((b) => {
      const r = addMember(b, name, COLORS[Object.keys(b.members || {}).length % COLORS.length]);
      const c = r.board.cards[cardId];
      return touchCard(r.board, cardId, { assignees: [...new Set([...c.assignees, r.member.id])] });
    });
    setNewPerson("");
  };

  const footer = (
    <>
      <button
        className="btn ghost danger"
        onClick={() => {
          if (window.confirm("Apagar esta tarefa?")) {
            patch({ deleted: true });
            onClose();
          }
        }}
      >
        <Icon name="trash" size={16} /> Apagar
      </button>
      <button className="btn primary" onClick={onClose}>
        Pronto
      </button>
    </>
  );

  return (
    <Modal title={col ? col.name : "Tarefa"} onClose={onClose} size="lg" footer={footer}>
      <div
        className="card-editor"
        onPaste={(e) => {
          const files = [...e.clipboardData.files];
          if (files.length) {
            e.preventDefault();
            addImages(files);
          }
        }}
        onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
        onDrop={(e) => {
          if (e.dataTransfer.files.length) {
            e.preventDefault();
            addImages(e.dataTransfer.files);
          }
        }}
      >
        <textarea
          className="title-input"
          rows={1}
          defaultValue={card.title}
          key={`t-${card.title}`}
          onBlur={(e) => e.target.value.trim() && e.target.value !== card.title && patch({ title: e.target.value.trim() })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          aria-label="Título"
        />

        <section className="field column-pick">
          <span className="label">Coluna</span>
          <div className="move-chips">
            {columns.map((c) => (
              <button key={c.id} className={`move-chip ${c.id === card.columnId ? "on" : ""}`} style={{ "--col": c.color }} onClick={() => c.id !== card.columnId && patch({ columnId: c.id })}>
                <span className="col-dot" />
                {c.name}
              </button>
            ))}
          </div>
        </section>

        <div className="editor-grid">
          <div className="editor-main">
            <section className="field sec-notes">
              <span className="label">
                <Icon name="text" size={15} /> Notas
              </span>
              <NotesEditor key={cardId} value={card.desc} onChange={(desc) => patch({ desc })} />
            </section>

            <section className="field sec-extra">
              <span className="label">
                <Icon name="image" size={15} /> Imagens
              </span>
              {card.images.length > 0 && (
                <div className="gallery">
                  {card.images.map((img, i) => (
                    <figure key={img.id}>
                      <button className="thumb" onClick={() => setViewer(i)} aria-label="Ver imagem">
                        <img src={img.src} alt="" />
                      </button>
                      <button className="thumb-remove" aria-label="Remover imagem" onClick={() => patch({ images: card.images.filter((i) => i.id !== img.id) })}>
                        <Icon name="x" size={14} />
                      </button>
                    </figure>
                  ))}
                </div>
              )}
              <label className={`dropzone ${busy ? "busy" : ""}`}>
                <input type="file" accept="image/*" multiple hidden onChange={(e) => addImages(e.target.files)} />
                <Icon name="upload" size={16} />
                {busy ? "Enviando..." : "Escolher, arrastar ou colar imagens"}
              </label>
            </section>

            <section className="field sec-extra">
              <span className="label">
                <Icon name="link" size={15} /> Links
              </span>
              {card.links.length > 0 && (
                <ul className="link-list">
                  {card.links.map((l) => (
                    <li key={l.id}>
                      <a href={l.url} target="_blank" rel="noreferrer noopener">
                        <Icon name="external" size={14} />
                        <span>{l.title || hostOf(l.url)}</span>
                        <small>{l.url}</small>
                      </a>
                      <button className="icon-btn" aria-label="Remover link" onClick={() => patch({ links: card.links.filter((x) => x.id !== l.id) })}>
                        <Icon name="x" size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="inline-add">
                <input value={newLink} onChange={(e) => setNewLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLink()} placeholder="Colar link (site, vídeo, imagem...)" />
                <button className="btn small" onClick={addLink}>
                  Adicionar
                </button>
              </div>
            </section>

            <section className="field sec-extra">
              <span className="label">
                <Icon name="checklist" size={15} /> Checklist
                {card.checklist.length > 0 && (
                  <small>
                    {card.checklist.filter((i) => i.done).length} de {card.checklist.length}
                  </small>
                )}
              </span>
              {card.checklist.length > 0 && (
                <div className="progress">
                  <div style={{ width: `${(card.checklist.filter((i) => i.done).length / card.checklist.length) * 100}%` }} />
                </div>
              )}
              <ul className="checklist">
                {card.checklist.map((item) => (
                  <li key={item.id}>
                    <label>
                      <input type="checkbox" checked={item.done} onChange={() => patch({ checklist: card.checklist.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)) })} />
                      <span className={item.done ? "struck" : ""}>{item.text}</span>
                    </label>
                    <button className="icon-btn" aria-label="Remover item" onClick={() => patch({ checklist: card.checklist.filter((i) => i.id !== item.id) })}>
                      <Icon name="x" size={14} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="inline-add">
                <input value={newItem} onChange={(e) => setNewItem(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addItem()} placeholder="Novo item" />
                <button className="btn small" onClick={addItem}>
                  Adicionar
                </button>
              </div>
            </section>
          </div>

          <aside className="editor-side">


            <section className="field">
              <span className="label">
                <Icon name="calendar" size={15} /> Prazo
              </span>
              {due && <div className={`due-banner ${due.tone}`}>{due.label}</div>}
              <input type="date" value={card.due} onChange={(e) => patch({ due: e.target.value })} />
              <div className="chips">
                <button className="chip-btn" onClick={() => patch({ due: isoIn(0) })}>
                  Hoje
                </button>
                <button className="chip-btn" onClick={() => patch({ due: isoIn(1) })}>
                  Amanhã
                </button>
                <button className="chip-btn" onClick={() => patch({ due: isoIn(7) })}>
                  1 semana
                </button>
                {card.due && (
                  <button className="chip-btn" onClick={() => patch({ due: "" })}>
                    Sem prazo
                  </button>
                )}
              </div>
            </section>

            <section className="field">
              <span className="label">
                <Icon name="users" size={15} /> Responsáveis
              </span>
              <div className="people-picker">
                {members.map((m) => (
                  <button key={m.id} className={`person ${card.assignees.includes(m.id) ? "on" : ""}`} onClick={() => toggle("assignees", m.id)}>
                    <Avatar member={m} size={22} />
                    <span>{m.name}</span>
                  </button>
                ))}
              </div>
              <div className="inline-add">
                <input value={newPerson} onChange={(e) => setNewPerson(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createPerson()} placeholder="Nova pessoa" />
                <button className="btn small" onClick={createPerson} aria-label="Adicionar pessoa">
                  <Icon name="plus" size={16} />
                </button>
              </div>
            </section>

            <section className="field">
              <span className="label">
                <Icon name="tag" size={15} /> Etiquetas
              </span>
              <div className="chips">
                {board.settings.tags.map((t) => (
                  <button key={t.id} className={`tag toggle ${card.tags.includes(t.id) ? "on" : ""}`} style={{ "--tag": t.color }} onClick={() => toggle("tags", t.id)}>
                    {t.name}
                  </button>
                ))}
              </div>
              <div className="inline-add">
                <input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createTag()} placeholder="Nova etiqueta" />
                <button className="btn small" onClick={createTag} aria-label="Criar etiqueta">
                  <Icon name="plus" size={16} />
                </button>
              </div>
            </section>

            <section className="field">
              <span className="label">
                <Icon name="flag" size={15} /> Prioridade
              </span>
              <div className="segmented">
                {PRIORITIES.map((p) => (
                  <button key={p.id} className={`p${p.id} ${card.priority === p.id ? "on" : ""}`} onClick={() => patch({ priority: p.id })}>
                    {p.id === 0 ? "Nenhuma" : p.label}
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>

      {viewer !== null && card.images.length > 0 && (
        <ImageViewer images={card.images} start={viewer} title={card.title} onClose={() => setViewer(null)} toast={toast} />
      )}
    </Modal>
  );
}
