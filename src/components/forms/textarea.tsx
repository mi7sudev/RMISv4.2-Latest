"use client";

// ============================================================================
// RMIS glue — BEUI-style Textarea.
// NOT a vendored BEUI file: the official registry has no textarea block
// (probed 2026-10-11 — beui.dev/r/textarea → 404; registry.json lists input,
// select, combobox… but no multiline field). Per the migration doctrine
// (Task 4 composed sign-in from official primitives the same way), this is
// RMIS glue that mirrors the OFFICIAL Input anatomy byte-for-token:
//   • identical label classes (px-1 text-sm font-medium text-foreground)
//   • identical border/focus/error tokens (border-border, ring-foreground/40
//     + ring-ring/40 focus, destructive ring on error)
//   • identical animated error line (blur/fade, role=alert) and the
//     reserveErrorLine contract
//   • identical value contract: onChange receives the STRING, not the event
// One deliberate deviation: rounded-2xl instead of the h-11 capsule — a
// multiline field can't be a pill. Everything else matches the official
// field, so forms mix inputs and textareas without visual drift.
// ============================================================================

import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

export type TextareaClassNames = {
  root?: string;
  label?: string;
  field?: string;
  textarea?: string;
  errorMessage?: string;
};

export interface TextareaProps
  extends Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    "value" | "defaultValue" | "onChange"
  > {
  label?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Truthy error triggers the red ring and (if a string) the message. */
  error?: string | boolean;
  /** Reserve one message line so validation does not shift nearby content. */
  reserveErrorLine?: boolean;
  /** Additional element (e.g. a character counter) rendered after the field. */
  children?: ReactNode;
  className?: string;
  classNames?: TextareaClassNames;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      label,
      value: valueProp,
      defaultValue,
      onChange,
      onFocus,
      onBlur,
      error,
      reserveErrorLine = false,
      children,
      className,
      classNames,
      disabled,
      id: idProp,
      rows = 3,
      ...rest
    },
    ref,
  ) {
    const reactId = useId();
    const id = idProp ?? reactId;
    const reduce = useReducedMotion();

    const controlled = valueProp !== undefined;
    const [internal, setInternal] = useState(defaultValue ?? "");
    const value = controlled ? (valueProp ?? "") : internal;

    const [focused, setFocused] = useState(false);

    const fieldRef = useRef<HTMLDivElement>(null);

    const hasError = Boolean(error);
    const errorMessage = typeof error === "string" ? error : null;

    // Shake the field when an error appears — identical keyframes, duration
    // and reduced-motion guard as the official Input
    // (src/components/motion/input), so mixed grids move as one.
    useEffect(() => {
      if (!fieldRef.current || reduce || !hasError) return;
      animate(fieldRef.current, { x: [0, -6, 6, -4, 4, -2, 0] }, { duration: 0.45 });
    }, [hasError, reduce]);

    return (
      <div className={cn("flex flex-col gap-1.5", className, classNames?.root)}>
        {label ? (
          <label
            htmlFor={id}
            className={cn(
              "px-1 text-sm font-medium text-foreground",
              classNames?.label,
            )}
          >
            {label}
          </label>
        ) : null}

        <div
          ref={fieldRef}
          data-state={hasError ? "error" : focused ? "focused" : "idle"}
          className={cn(
            "relative rounded-2xl border transition-colors duration-200",
            "border-border",
            focused && !hasError && "border-foreground/40 ring-2 ring-ring/40",
            hasError && "border-destructive ring-2 ring-destructive/25",
            disabled && "opacity-60",
            classNames?.field,
          )}
        >
          <textarea
            ref={ref}
            id={id}
            rows={rows}
            value={value}
            disabled={disabled}
            aria-invalid={hasError || undefined}
            aria-describedby={errorMessage ? `${id}-error` : undefined}
            {...rest}
            onChange={(e) => {
              if (!controlled) setInternal(e.target.value);
              onChange?.(e.target.value);
            }}
            onFocus={(event) => {
              setFocused(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              onBlur?.(event);
            }}
            className={cn(
              "block w-full resize-y bg-transparent px-3.5 py-2.5 text-base leading-6 text-foreground caret-foreground outline-none",
              "placeholder:text-muted-foreground/60",
              disabled && "cursor-not-allowed",
              classNames?.textarea,
            )}
          />
        </div>

        {children}

        <div className={reserveErrorLine ? "min-h-4" : "contents"}>
          <AnimatePresence initial={false}>
            {errorMessage ? (
              <motion.p
                id={`${id}-error`}
                role="alert"
                initial={
                  reduce
                    ? { opacity: 0 }
                    : { opacity: 0, y: -4, filter: "blur(4px)" }
                }
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={
                  reduce
                    ? { opacity: 0 }
                    : { opacity: 0, y: -4, filter: "blur(4px)" }
                }
                transition={{ duration: 0.2 }}
                className={cn(
                  "px-1 text-xs text-destructive",
                  classNames?.errorMessage,
                )}
              >
                {errorMessage}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    );
  },
);
