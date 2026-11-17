// Cliente da API do S'Kitty.
//
// No site, a API fica no mesmo endereco (/api). No app Android (Capacitor) o
// app roda em https://localhost, entao usa o endereco publicado, definido em
// VITE_SITE_URL no build do app (veja .env.android).

const SITE = (import.meta.env.VITE_SITE_URL || "").replace(/\/$/, "");

/** Endereco publico do site (para links de convite e para a IA). */
export function siteUrl() {
  return SITE || window.location.origin;
}

export function apiBase() {
  return `${siteUrl()}/api`;
}

export const isNativeApp = () => !!window.Capacitor?.isNativePlatform?.();

async function call(method, path, payload) {
  let res;
  try {
    res = await fetch(`${SITE}/api${path}`, {
      method,
      headers: payload ? { "content-type": "application/json" } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
    });
  } catch {
    throw Object.assign(new Error("Sem internet"), { offline: true });
  }
  const type = res.headers.get("content-type") || "";
  if (!type.includes("application/json")) {
    // Sem a funcao do Netlify (ex.: "npm run dev" puro) a resposta vem como HTML.
    throw Object.assign(new Error("API indisponível"), { offline: true });
  }
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error || `erro ${res.status}`), { status: res.status });
  return data;
}

export const api = {
  createShared: (board) => call("POST", "/boards", { board }),
  get: (code, since) => call("GET", `/boards/${encodeURIComponent(code)}${since ? `?since=${since}` : ""}`),
  push: (code, board) => call("PUT", `/boards/${encodeURIComponent(code)}`, { board }),
};
