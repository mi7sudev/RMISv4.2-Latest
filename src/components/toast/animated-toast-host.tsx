"use client";

// ============================================================================
// RMIS — single mounted host for the official BEUI AnimatedToastStack
// (beui.dev/components/motion/animated-toast-stack).
//
// Owns the official useAnimatedToastStack hook (toast list + auto-dismiss
// timers) and registers its imperative API into lib/toast so any view can
// raise a toast from anywhere. Replaces the legacy sonner <Toaster>.
// ============================================================================

import { useEffect } from "react";
import {
  AnimatedToastStack,
  useAnimatedToastStack,
} from "@/components/motion/animated-toast-stack";
import { registerToastHost } from "@/lib/toast";

export function AnimatedToastHost() {
  const stack = useAnimatedToastStack({ defaultDuration: 4200, limit: 5 });

  useEffect(() => {
    registerToastHost({
      show: stack.showToast,
      update: stack.updateToast,
      dismiss: stack.dismissToast,
      clear: stack.clearToasts,
    });
    return () => registerToastHost(null);
  }, [stack]);

  return (
    <AnimatedToastStack
      toasts={stack.toasts}
      onDismiss={stack.dismissToast}
      position="top-right"
      placement="fixed"
      maxVisible={4}
    />
  );
}

export default AnimatedToastHost;
