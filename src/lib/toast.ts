// ============================================================================
// RMIS — imperative toast facade over the official BEUI AnimatedToastStack
// (beui.dev/components/motion/animated-toast-stack).
//
// The official stack is state-driven: `useAnimatedToastStack` owns the toast
// list + auto-dismiss timers inside the mounted <AnimatedToastHost>. This
// module is the application-wide command surface — views call `toast.success`
// etc. from anywhere (event handlers, effects, helpers) and the host, mounted
// once in the root layout, forwards every command into the official hook.
//
// Status mapping (BEUI vocabulary has no "warning"):
//   success → success · error → error · info → info · warning → error
// ============================================================================

import type { ToastInput } from "@/components/motion/animated-toast-stack";

/** Commands the mounted host understands — the official hook's API surface. */
export type ToastHostApi = {
  show: (input: ToastInput) => string;
  update: (id: string, patch: Partial<ToastInput>) => void;
  dismiss: (id: string) => void;
  clear: () => void;
};

let host: ToastHostApi | null = null;

/** Called by <AnimatedToastHost> on mount (and with null on unmount). */
export function registerToastHost(api: ToastHostApi | null) {
  host = api;
}

/** Options mirror the sonner call sites this facade replaced. */
export type ToastOptions = {
  description?: React.ReactNode;
  /** ms until auto-dismiss; 0 = sticky. */
  duration?: number;
  /** Pill button rendered under the description (official AnimatedToastAction). */
  action?: { label: React.ReactNode; onClick: () => void };
};

type Level = "neutral" | "info" | "loading" | "success" | "error";

function emit(status: Level, title: React.ReactNode, opts?: ToastOptions): string {
  const input: ToastInput = {
    status,
    title,
    description: opts?.description,
    duration: opts?.duration,
    action: opts?.action,
  };
  return host?.show(input) ?? "";
}

export const toast = {
  success: (title: React.ReactNode, opts?: ToastOptions) => emit("success", title, opts),
  error: (title: React.ReactNode, opts?: ToastOptions) => emit("error", title, opts),
  info: (title: React.ReactNode, opts?: ToastOptions) => emit("info", title, opts),
  /** BEUI has no warning status — cautions surface as the attention (error) tone. */
  warning: (title: React.ReactNode, opts?: ToastOptions) => emit("error", title, opts),
  loading: (title: React.ReactNode, opts?: ToastOptions) => emit("loading", title, opts),
  neutral: (title: React.ReactNode, opts?: ToastOptions) => emit("neutral", title, opts),
  dismiss: (id: string) => host?.dismiss(id),
  clear: () => host?.clear(),
};

export default toast;
