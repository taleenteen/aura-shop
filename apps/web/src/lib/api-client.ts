import type { ApiResponse, ApiMeta } from "@/types/api";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api/v1";

export function getGuestSessionId(): string {
  const STORAGE_KEY = "aura_guest_session_id";
  let guestId = localStorage.getItem(STORAGE_KEY);
  if (!guestId) {
    guestId = `guest_${crypto.randomUUID()}`;
    localStorage.setItem(STORAGE_KEY, guestId);
  }
  return guestId;
}

export function getAuthToken(): string | null {
  return localStorage.getItem("aura_jwt_token");
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem("aura_jwt_token", token);
  } else {
    localStorage.removeItem("aura_jwt_token");
  }
}

export interface ApiClientResult<T> {
  data: T;
  meta: ApiMeta | null;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiClientResult<T>> {
  const guestId = getGuestSessionId();
  const token = getAuthToken();

  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  headers.set("X-Guest-Session-ID", guestId);

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const url = endpoint.startsWith("http")
    ? endpoint
    : `${API_BASE_URL}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const responseGuestId = response.headers.get("X-Guest-Session-ID");
  if (responseGuestId && responseGuestId !== guestId) {
    localStorage.setItem("aura_guest_session_id", responseGuestId);
  }

  let json: ApiResponse<T>;
  try {
    json = await response.json();
  } catch {
    throw new Error(`HTTP Error ${response.status}: Failed to parse response`);
  }

  if (!response.ok || !json.success) {
    const errorMsg =
      json.error?.message ||
      `Request failed with status ${response.status} (${json.error?.code || "UNKNOWN_ERROR"})`;
    const err = new Error(errorMsg);
    (err as unknown as { code?: string }).code = json.error?.code;
    throw err;
  }

  return {
    data: json.data as T,
    meta: json.meta,
  };
}
