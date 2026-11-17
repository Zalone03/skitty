import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { saveImage } from "../files.js";
import { Icon } from "./ui.jsx";

/** Imagens em tela cheia, estilo slide: setas, deslizar, teclado e baixar. */
export function ImageViewer({ images, start = 0, title = "imagem", onClose, toast }) {
  const [index, setIndex] = useState(Math.min(start, images.length - 1));
  const [busy, setBusy] = useState(false);
  const touch = useRef(null);
  const count = images.length;
  const go = (delta) => setIndex((i) => (i + delta + count) % count);

  useEffect(() => {
    const onKey = (e) => {
      if (["Escape", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  useEffect(() => {
    document.querySelector(`.viewer-thumbs [data-i="${index}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [index]);

  if (!count) return null;
  const img = images[index];

  const download = async () => {
    setBusy(true);
    try {
      const how = await saveImage(img.src, count > 1 ? `${title}-${index + 1}` : title);
      if (how === "baixado") toast?.("Imagem baixada");
      if (how === "aberto") toast?.("Abri a imagem numa nova aba para salvar");
    } catch {
      toast?.("Não consegui salvar a imagem", "warn");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="viewer"
      role="dialog"
      aria-label="Imagens"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        if (!touch.current) return;
        const dx = e.changedTouches[0].clientX - touch.current.x;
        const dy = e.changedTouches[0].clientY - touch.current.y;
        touch.current = null;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) go(dx < 0 ? 1 : -1);
        else if (dy > 90 && Math.abs(dy) > Math.abs(dx) * 1.5) onClose();
      }}
    >
      <header className="viewer-bar">
        <span className="viewer-count">{count > 1 ? `${index + 1} de ${count}` : "Imagem"}</span>
        <div className="row tight">
          <button className="viewer-btn" onClick={download} disabled={busy} aria-label="Baixar imagem">
            <Icon name="download" size={20} />
            <span className="viewer-label">{busy ? "Salvando" : "Baixar"}</span>
          </button>
          <button className="viewer-btn" onClick={onClose} aria-label="Fechar">
            <Icon name="x" size={22} />
          </button>
        </div>
      </header>

      <div className="viewer-stage" onClick={(e) => e.target === e.currentTarget && onClose()}>
        {count > 1 && (
          <button className="viewer-nav prev" onClick={() => go(-1)} aria-label="Imagem anterior">
            <Icon name="left" size={26} />
          </button>
        )}
        <img key={img.id} src={img.src} alt="" draggable={false} />
        {count > 1 && (
          <button className="viewer-nav next" onClick={() => go(1)} aria-label="Próxima imagem">
            <Icon name="right" size={26} />
          </button>
        )}
      </div>

      {count > 1 && (
        <div className="viewer-thumbs">
          {images.map((im, i) => (
            <button key={im.id} data-i={i} className={i === index ? "on" : ""} onClick={() => setIndex(i)} aria-label={`Imagem ${i + 1}`}>
              <img src={im.src} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}
