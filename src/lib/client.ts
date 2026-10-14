// ============================================================================
// RMIS — client data layer: fetch wrapper (spec §13 client contracts) +
// formatters. Client-side only.
//
// Deep-module note (codebase-design vocabulary): this file IS the client
// seam — everything a caller must know to talk to the RMIS API is the two
// entry points below (apiFetch / apiUpload) and the ApiClientError error
// mode. Transport (fetch vs XHR), credentials, the { error } envelope and
// the verbatim fallback messages live HERE and nowhere else — views must
// not grow private transport copies (the drift they cause is exactly why
// apiUpload exists: fetch cannot report upload progress, so the documents
// section once grew its own XHR clone whose fallback strings diverged).
// ============================================================================

export class ApiClientError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** The ONE error-message parser behind apiFetch AND apiUpload (internal
    seam): server `{ error }` envelope first, then the verbatim status
    fallbacks shared by every caller in the system. */
function apiErrorMessage(
  status: number,
  payload: { error?: string; details?: unknown } | null,
  fallback: string,
): string {
  return (
    payload?.error ||
    (status === 401 && "Please sign in to continue") ||
    (status === 403 && "You do not have permission to perform this action") ||
    (status === 404 && "Not found") ||
    (status >= 500 && "An unexpected error occurred. Please try again.") ||
    fallback
  );
}

/** Parse a response body tolerantly — null when not JSON. */
async function parseBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown; formData?: FormData } = {}
): Promise<T> {
  let res: Response;
  try {
    const headers: Record<string, string> = {};
    let body: BodyInit | undefined;
    if (opts.formData) {
      body = opts.formData;
    } else if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    res = await fetch(path, {
      method: opts.method || (body ? "POST" : "GET"),
      headers,
      body,
      credentials: "include",
    });
  } catch {
    throw new ApiClientError("Unable to connect to the server. Please check your connection.", 0);
  }
  const data = await parseBody(res);
  if (!res.ok) {
    const payload = (data ?? {}) as { error?: string; details?: unknown };
    throw new ApiClientError(apiErrorMessage(res.status, payload, "Request failed"), res.status, payload.details);
  }
  return data as T;
}

/** Multipart upload with TRUE byte progress — the upload half of the client
    seam. Same interface discipline as apiFetch (the caller passes path +
    FormData and learns only ApiClientError); the XHR transport, byte
    progress mapping, credentials, `{ error }` envelope, verbatim status
    fallbacks and abort wiring all live behind the seam. apiFetch cannot
    report upload progress (fetch limitation) — this is its progress-capable
    sibling, not a parallel convention. */
export function apiUpload<T = unknown>(
  path: string,
  formData: FormData,
  opts: {
    /** Progress in BYTES (the UploadCN adapter contract). */
    onProgress?: (loaded: number, total: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", path);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) opts.onProgress?.(e.loaded, e.total);
    };
    xhr.onload = () => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        payload = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload as T);
        return;
      }
      const envelope = (payload ?? null) as { error?: string; details?: unknown } | null;
      reject(
        new ApiClientError(
          apiErrorMessage(xhr.status, envelope, `Upload failed (${xhr.status})`),
          xhr.status,
          envelope?.details,
        ),
      );
    };
    xhr.onerror = () =>
      reject(new ApiClientError("Unable to connect to the server. Please check your connection.", 0));
    xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
    opts.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(formData);
  });
}

// ── Formatters (en-PH) ──────────────────────────────────────────────────────

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return typeof d === "string" ? d : "-";
  return date.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(d: string | Date | null | undefined): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return typeof d === "string" ? d : "-";
  return date.toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatCurrency(n: number | null | undefined): string {
  if (n == null) return "-";
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(n);
}

export function fullName(p: { firstName?: string | null; middleName?: string | null; lastName?: string | null; extensionName?: string | null } | null | undefined): string {
  if (!p) return "-";
  const parts = [p.firstName, p.middleName, p.lastName].filter(Boolean);
  let name = parts.join(" ");
  if (p.extensionName) name = `${name}, ${p.extensionName}`;
  return name || "-";
}

export function humanize(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\s+/g, " ").trim();
}

export function timeAgo(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}

/**
 * Long-form relative age for application dates, e.g. "3 days ago",
 * "last week", "2 weeks ago", "last month" — used on kanban cards
 * ("Applied {appliedAgo(date)}").
 */
export function appliedAgo(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "last week";
  if (days < 28) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 31) return "last week";
  const months = Math.floor(days / 30);
  if (months === 1) return "last month";
  if (months < 12) return `${months} months ago`;
  const years = Math.floor(days / 365);
  if (years <= 1) return "last year";
  return `${years} years ago`;
}

export function daysUntil(d: string | Date | null | undefined): number | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const target = new Date(date); target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / 86400000);
}

export function deadlineState(d: string | Date | null | undefined): { label: string; overdue: boolean; closingSoon: boolean } {
  const days = daysUntil(d);
  if (days === null) return { label: "Open until filled", overdue: false, closingSoon: false };
  if (days < 0) return { label: "Closed", overdue: true, closingSoon: false };
  if (days === 0) return { label: "Closing today", overdue: false, closingSoon: true };
  if (days <= 7) return { label: `Closing in ${days} day${days === 1 ? "" : "s"}`, overdue: false, closingSoon: true };
  if (days <= 30) return { label: `${days} days left`, overdue: false, closingSoon: false };
  return { label: "Open", overdue: false, closingSoon: false };
}
