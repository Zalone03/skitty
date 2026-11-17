import { useCallback, useEffect, useRef, useState } from "react";
import { mergeBoards } from "../shared/model.js";
import { api } from "./api.js";

const POLL_MS = 3000;
const PUSH_DELAY_MS = 600;

/**
 * Mantem o quadro ativo sincronizado com a nuvem (quando ele tem codigo).
 * status: "local" | "syncing" | "ok" | "offline" | "error"
 */
export function useSync(store) {
  const { state, ref, replaceBoard } = store;
  const active = state.boards[state.activeId];
  const [status, setStatus] = useState("local");
  const [lastError, setLastError] = useState("");
  const busy = useRef(false);
  const pushTimer = useRef(null);

  const tick = useCallback(async () => {
    const s = ref.current;
    const board = s.boards[s.activeId];
    if (!board?.code || busy.current) return;
    busy.current = true;
    const id = board.id;
    const meta = s.sync[id] || {};
    try {
      if (meta.dirty) {
        setStatus("syncing");
        const sentAt = meta.dirtyAt;
        const res = await api.push(board.code, board);
        const latest = ref.current.boards[id];
        if (latest) {
          const stillDirty = (ref.current.sync[id] || {}).dirtyAt !== sentAt;
          replaceBoard(id, { ...mergeBoards(latest, res.board), id }, { version: res.version, dirty: stillDirty });
        }
      } else if (!document.hidden) {
        const res = await api.get(board.code, meta.version || 0);
        if (!res.unchanged) {
          const latest = ref.current.boards[id];
          if (latest) replaceBoard(id, { ...mergeBoards(latest, res.board), id }, { version: res.version });
        }
      }
      setStatus("ok");
      setLastError("");
    } catch (err) {
      setStatus(err.offline ? "offline" : "error");
      setLastError(err.message);
    } finally {
      busy.current = false;
    }
  }, [ref, replaceBoard]);

  // Pergunta a nuvem de tempos em tempos.
  useEffect(() => {
    if (!active?.code) {
      setStatus("local");
      return undefined;
    }
    tick();
    const t = setInterval(tick, POLL_MS);
    const onFocus = () => tick();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [active?.id, active?.code, tick]);

  // Envia logo depois de cada mudanca.
  const dirty = active ? state.sync[active.id]?.dirtyAt : null;
  useEffect(() => {
    if (!active?.code || !dirty) return undefined;
    clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(tick, PUSH_DELAY_MS);
    return () => clearTimeout(pushTimer.current);
  }, [dirty, active?.code, tick]);

  return { status, lastError, syncNow: tick };
}
