// Salvar arquivos no site e no app Android.
//
// No navegador, um link com "download" resolve. No app (WebView do Android)
// isso nao funciona: o arquivo vai para o cache do app e abre a tela de
// compartilhar do Android, onde a pessoa escolhe salvar, mandar no WhatsApp etc.

import { isNativeApp } from "./api.js";

export function dataUrlToBlob(dataUrl) {
  const [head, data] = dataUrl.split(",");
  const type = (head.match(/data:([^;]+)/) || [])[1] || "application/octet-stream";
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export function safeFileName(name, fallback = "arquivo") {
  const clean = String(name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return clean || fallback;
}

export function extensionFor(type) {
  return { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/avif": "avif" }[type] || "bin";
}

/** Salva um Blob com o nome dado. Devolve "baixado" ou "compartilhado". */
export async function saveBlob(blob, fileName) {
  if (isNativeApp()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
    const written = await Filesystem.writeFile({ path: fileName, data: await blobToBase64(blob), directory: Directory.Cache });
    await Share.share({ title: fileName, files: [written.uri] });
    return "compartilhado";
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return "baixado";
}

export function saveText(text, fileName, type = "text/markdown") {
  return saveBlob(new Blob([text], { type: `${type};charset=utf-8` }), fileName);
}

/** Baixa uma imagem do cartao (data URL ou endereco da internet). */
export async function saveImage(src, baseName) {
  let blob;
  if (src.startsWith("data:")) blob = dataUrlToBlob(src);
  else {
    try {
      const res = await fetch(src, { mode: "cors" });
      if (!res.ok) throw new Error();
      blob = await res.blob();
    } catch {
      window.open(src, "_blank", "noopener");
      return "aberto";
    }
  }
  return saveBlob(blob, `${safeFileName(baseName, "imagem")}.${extensionFor(blob.type)}`);
}
