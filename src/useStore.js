import { useCallback, useEffect, useRef, useState } from "react";
import { addMember, createBoard } from "../shared/model.js";

const KEY = "skitty:v2";

export const defaultPrefs = () => ({
  theme: window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark",
  accent: "#7c5cff",
  compact: false,
  showDesc: true,
});

/** Projeto novo e vazio, ja com a pessoa que criou (para "Minhas tarefas"). */
export function newProject(name, color, personName) {
  let board = createBoard(name, color);
  let me = null;
  if (personName && personName.trim()) {
    const r = addMember(board, personName.trim());
    board = r.board;
    me = r.member.id;
  }
  return { board, me };
}

function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.boards && Array.isArray(s.order)) {
        const order = s.order.filter((id) => s.boards[id]);
        const activeId = order.includes(s.activeId) ? s.activeId : order[0] || null;
        return { sync: {}, me: {}, ...s, order, activeId, prefs: { ...defaultPrefs(), ...s.prefs } };
      }
    }
  } catch {
    /* armazenamento indisponivel: comeca do zero */
  }
  // Primeira vez: sem projeto de exemplo, abre a tela de boas-vindas.
  return { boards: {}, order: [], activeId: null, prefs: defaultPrefs(), sync: {}, me: {} };
}

export function useStore() {
  const [state, setState] = useState(loadState);
  const ref = useRef(state);
  ref.current = state;

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch {
        /* cheio (imagens grandes) ou bloqueado */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [state]);

  const set = useCallback((fn) => setState((s) => fn(s)), []);

  /** Aplica fn(board) e, se o quadro e compartilhado, marca para enviar. */
  const updateBoard = useCallback(
    (id, fn) =>
      set((s) => {
        const old = s.boards[id];
        if (!old) return s;
        const next = fn(old);
        if (!next || next === old) return s;
        const sync = old.code ? { ...s.sync, [id]: { ...(s.sync[id] || {}), dirty: true, dirtyAt: Date.now() } } : s.sync;
        return { ...s, boards: { ...s.boards, [id]: next }, sync };
      }),
    [set]
  );

  const replaceBoard = useCallback(
    (id, board, syncPatch) =>
      set((s) =>
        s.boards[id]
          ? { ...s, boards: { ...s.boards, [id]: board }, sync: syncPatch ? { ...s.sync, [id]: { ...(s.sync[id] || {}), ...syncPatch } } : s.sync }
          : s
      ),
    [set]
  );

  const addBoard = useCallback(
    (board, syncPatch) =>
      set((s) => ({
        ...s,
        boards: { ...s.boards, [board.id]: board },
        order: [...s.order, board.id],
        activeId: board.id,
        sync: syncPatch ? { ...s.sync, [board.id]: syncPatch } : s.sync,
      })),
    [set]
  );

  const removeBoard = useCallback(
    (id) =>
      set((s) => {
        const boards = { ...s.boards };
        delete boards[id];
        const order = s.order.filter((x) => x !== id);
        const sync = { ...s.sync };
        delete sync[id];
        return { ...s, boards, order, sync, activeId: s.activeId === id ? order[0] || null : s.activeId };
      }),
    [set]
  );

  const setPrefs = useCallback((patch) => set((s) => ({ ...s, prefs: { ...s.prefs, ...patch } })), [set]);
  const setMe = useCallback((boardId, memberId) => set((s) => ({ ...s, me: { ...s.me, [boardId]: memberId } })), [set]);

  return { state, ref, set, updateBoard, replaceBoard, addBoard, removeBoard, setPrefs, setMe };
}
