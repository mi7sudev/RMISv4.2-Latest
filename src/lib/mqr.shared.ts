// Client-safe MQR constants (mirror of the server-side verdict strings in
// src/lib/mqr.ts — kept dependency-free so client components can import them).
export const MQR_MEETS = "Meets the minimum requirements";
export const MQR_FAILS = "Does not meet the minimum requirements";
