// Thin fetch wrapper: JWT auth with silent refresh, tenant + branch headers, DRF error flattening.
const ROOT_DOMAIN = import.meta.env.VITE_ROOT_DOMAIN || "ciron.local";
const STORE = "ciron.session";

export function subdomainFromHost() {
  const host = window.location.hostname.toLowerCase();
  const suffix = "." + ROOT_DOMAIN;
  if (host.endsWith(suffix)) {
    const sub = host.slice(0, -suffix.length);
    if (sub && !sub.includes(".") && !["www", "app", "api"].includes(sub)) return sub;
  }
  return null;
}

export function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(STORE)) || null;
  } catch {
    return null;
  }
}

export function saveSession(s) {
  try {
    if (s) localStorage.setItem(STORE, JSON.stringify(s));
    else localStorage.removeItem(STORE);
  } catch {
    /* storage unavailable */
  }
}

export class ApiError extends Error {
  constructor(status, data) {
    super(flattenError(data) || `Request failed (${status})`);
    this.status = status;
    this.data = data;
  }
}

export function flattenError(data) {
  if (!data) return "";
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return data.map(flattenError).join(" ");
  if (data.detail) return flattenError(data.detail);
  return Object.entries(data)
    .map(([k, v]) => (k === "non_field_errors" ? flattenError(v) : `${k.replace(/_/g, " ")}: ${flattenError(v)}`))
    .join(" · ");
}

let refreshing = null;
let onSessionExpired = () => {};
export const setSessionExpiredHandler = (fn) => (onSessionExpired = fn);

async function refreshToken() {
  const s = loadSession();
  if (!s?.refresh) throw new Error("no refresh token");
  const r = await fetch("/api/auth/refresh/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh: s.refresh }),
  });
  if (!r.ok) throw new Error("refresh failed");
  const { access } = await r.json();
  saveSession({ ...s, access });
  return access;
}

export async function api(path, { method = "GET", body, params, raw = false, retry = true } = {}) {
  const s = loadSession();
  const url = new URL("/api" + path, window.location.origin);
  Object.entries(params || {}).forEach(([k, v]) => v !== undefined && v !== null && v !== "" && url.searchParams.set(k, v));
  const headers = {};
  if (s?.access) headers.Authorization = `Bearer ${s.access}`;
  const business = subdomainFromHost() || s?.business?.subdomain;
  if (business) headers["X-Business"] = business;
  if (s?.branchId) headers["X-Branch"] = s.branchId;
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const r = await fetch(url, { method, headers, body: payload });
  if (r.status === 401 && retry && s?.refresh) {
    try {
      refreshing = refreshing || refreshToken();
      await refreshing;
    } catch {
      onSessionExpired();
      throw new ApiError(401, { detail: "Your session has expired. Please sign in again." });
    } finally {
      refreshing = null;
    }
    return api(path, { method, body, params, raw, retry: false });
  }
  if (raw) {
    if (!r.ok) throw new ApiError(r.status, await r.json().catch(() => null));
    return r;
  }
  if (r.status === 204) return null;
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new ApiError(r.status, data);
  return data;
}

export async function download(path, params, filename) {
  const r = await api(path, { params, raw: true });
  const blob = await r.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Fetch every page of a paginated list (for small lookups like customers in a select).
export async function listAll(path, params) {
  const data = await api(path, { params: { page_size: 1000, ...params } });
  return Array.isArray(data) ? data : data.results;
}
