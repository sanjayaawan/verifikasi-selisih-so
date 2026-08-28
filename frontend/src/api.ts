export type Role = "auditor" | "auditee";

export interface AuthUser {
  id: number;
  username: string;
  full_name: string;
  role: Role;
}

const TOKEN_KEY = "vso_token";
const USER_KEY = "vso_user";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request(path: string, options: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!(options.body instanceof FormData) && options.body) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`/api${path}`, { ...options, headers });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : null;

  if (!res.ok) {
    throw new Error(data?.error || `Request gagal (${res.status})`);
  }
  return data;
}

export const api = {
  login: (username: string, password: string) =>
    request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),

  importSource: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request("/source/import", { method: "POST", body: form });
  },

  searchItem: (stock_code: string, discrepancy_type: "MINUS" | "PLUS") =>
    request(`/verification/search?stock_code=${encodeURIComponent(stock_code)}&discrepancy_type=${discrepancy_type}`),

  submitVerification: (payload: {
    source_item_id: number;
    physical_qty: number;
    location: string;
    checked_by: string;
    cycle_count_qty?: number;
    cycle_count_date?: string;
  }) => request("/verification/submit", { method: "POST", body: JSON.stringify(payload) }),

  myVerifications: () => request("/verification/mine"),

  listVerifications: (status?: string, discrepancy_type?: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (discrepancy_type) params.set("discrepancy_type", discrepancy_type);
    return request(`/verification/list?${params.toString()}`);
  },

  approve: (id: number) => request(`/verification/${id}/approve`, { method: "POST" }),

  reject: (id: number, rejection_reason: string) =>
    request(`/verification/${id}/reject`, { method: "POST", body: JSON.stringify({ rejection_reason }) }),

  dashboard: () => request("/dashboard"),

  exportData: () => request("/export"),
};
