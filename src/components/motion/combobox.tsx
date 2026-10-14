"use client";
// ============================================================================
// beui.dev/components/motion/combobox — the "pick from list OR type your own"
// control of the official select family. The trigger wears the exact
// SelectTrigger field tokens (rounded-xl border-border bg-background, quiet
// focus ring, rotating chevron) around a REAL input, and the panel reuses the
// SelectContent anatomy (rounded-xl, shadow-lg, p-1, muted item rows with the
// hover tint + selected check + top/bottom placement flip). Free typing always
// wins — the value is the raw text; options are suggestions filtered as you
// type. Error contract mirrors the official Input (destructive ring, shake,
// animated message line). Exists so RMIS speaks ONE dropdown UI: the profile
// entry-form datalist fields and the admin recruitment form's type-or-pick
// fields all render this instead of the native browser datalist.
//
// Staff-extensible vocabulary (scalability request 2026-10): pass
// `onAddOption` and the panel grows an "Add \"…\"" row whenever the typed text
// matches NO option (it replaces the "No matches" copy). Clicking it — or
// Enter with it highlighted — hands the raw text to the caller (which POSTs
// it server-side); returning the created option selects it and closes the
// panel, exactly like a picked row. The row participates in arrow-key
// navigation as the last index, and shows an "Adding…" state while the
// caller's promise is in flight.
// ============================================================================

import { Check, ChevronDown, Plus } from "lucide-react";
import {
  AnimatePresence,
  animate,
  motion,
  useReducedMotion,
} from "motion/react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Muted secondary line shown under the label in the panel. */
  hint?: string;
}

export interface ComboboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onSubmit"> {
  label?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options?: ComboboxOption[];
  error?: string | boolean;
  reserveErrorLine?: boolean;
  className?: string;
  /** Extra classes on the trigger field (height / fill / radius pins). */
  triggerClassName?: string;
  /** Extra classes on the dropdown panel (e.g. a z-boost inside dialogs). */
  contentClassName?: string;
  /** Staff-extensible vocabulary: when the typed text matches no option, the
   *  panel renders an "Add \"…\"" row that hands the raw text to this handler
   *  (persist it server-side). Return the created option to have the
   *  Combobox select it and close the panel, exactly like a picked row.
   *  Throw/reject to keep the panel open (the caller surfaces the error). */
  onAddOption?: (raw: string) => Promise<ComboboxOption | void>;
}

export const Combobox = function Combobox({
  label,
  value: valueProp,
  defaultValue,
  onValueChange,
  options = [],
  error,
  reserveErrorLine = false,
  className,
  triggerClassName,
  contentClassName,
  onAddOption,
  disabled,
  id: idProp,
  ...rest
}: ComboboxProps) {
  const reactId = useId();
  const id = idProp ?? `${reactId}-combo`;
  const listId = `${id}-list`;
  const reduce = useReducedMotion();

  const controlled = valueProp !== undefined;
  const [internal, setInternal] = useState(defaultValue ?? "");
  const value = controlled ? (valueProp ?? "") : internal;

  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [placement, setPlacement] = useState<"bottom" | "top">("bottom");
  const [adding, setAdding] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasError = Boolean(error);
  const errorMessage = typeof error === "string" ? error : null;

  const query = value.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!query) return options;
    return options.filter(
      (o) =>
        o.value.toLowerCase().includes(query) || o.label.toLowerCase().includes(query)
    );
  }, [options, query]);

  // Staff-extensible vocabulary: the "Add" row shows whenever the typed text
  // is non-empty and exactly matches no option (case-insensitive) — i.e. the
  // text would otherwise be a free-typed value nobody else will see.
  const trimmedValue = value.trim();
  const exactMatch = useMemo(
    () =>
      trimmedValue !== "" &&
      options.some(
        (o) =>
          o.value.toLowerCase() === trimmedValue.toLowerCase() ||
          o.label.toLowerCase() === trimmedValue.toLowerCase()
      ),
    [options, trimmedValue]
  );
  const showAddRow = Boolean(onAddOption) && trimmedValue !== "" && !exactMatch;
  // The Add row is the last keyboard index after the filtered options.
  const lastIndex = filtered.length + (showAddRow ? 1 : 0) - 1;

  const setOpenSafe = (next: boolean) => {
    setOpen(next);
    if (!next) setHighlight(-1);
  };

  // Close on outside pointerdown.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpenSafe(false);
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [open]);

  // Highlight tracks the first suggestion while browsing.
  useEffect(() => {
    setHighlight(open ? 0 : -1);
  }, [open, value]);

  // Flip the panel upward when there isn't room below and there's more above.
  useLayoutEffect(() => {
    if (!open) return;
    const field = fieldRef.current;
    const panel = panelRef.current;
    if (!field || !panel) return;
    const rect = field.getBoundingClientRect();
    const h = panel.offsetHeight;
    const below = window.innerHeight - rect.bottom;
    setPlacement(below < h + 16 && rect.top > below ? "top" : "bottom");
  }, [open, filtered.length]);

  // Official Input error contract — shake on error appearance.
  useEffect(() => {
    if (!fieldRef.current || reduce || !hasError) return;
    animate(fieldRef.current, { x: [0, -6, 6, -4, 4, -2, 0] }, { duration: 0.45 });
  }, [hasError, reduce]);

  const setValue = (next: string) => {
    if (!controlled) setInternal(next);
    onValueChange?.(next);
  };

  const selectOption = (option: ComboboxOption) => {
    setValue(option.value);
    setOpenSafe(false);
    inputRef.current?.focus();
  };

  const doAdd = async () => {
    if (!onAddOption || adding || trimmedValue === "") return;
    const raw = trimmedValue;
    setAdding(true);
    try {
      const created = await onAddOption(raw);
      // A created option back means "persisted + merged" — select it and
      // close the panel exactly like a picked row. Void keeps the panel open
      // (the caller surfaced the failure).
      if (created && created.value) selectOption(created);
    } finally {
      setAdding(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpenSafe(true);
      else setHighlight((h) => Math.min(h + 1, lastIndex));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (open) {
        e.preventDefault();
        if (showAddRow && highlight === filtered.length) {
          void doAdd();
          return;
        }
        const hit = highlight >= 0 ? filtered[highlight] : undefined;
        if (hit) selectOption(hit);
        else setOpenSafe(false);
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpenSafe(false);
      }
    }
  };

  const renderItem = (option: ComboboxOption, index: number) => {
    const selected = option.value === value;
    const active = index === highlight;
    return (
      <button
        key={`${option.value}-${index}`}
        type="button"
        role="option"
        id={`${listId}-opt-${index}`}
        aria-selected={selected}
        onMouseEnter={() => setHighlight(index)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => selectOption(option)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm outline-none transition-colors",
          selected
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:bg-muted",
          active && !selected && "bg-muted text-foreground",
          "disabled:pointer-events-none disabled:opacity-50"
        )}
      >
        <span className="min-w-0">
          <span className="block truncate">{option.label}</span>
          {option.hint && (
            <span className="mt-0.5 block truncate text-xs text-muted-foreground/80">
              {option.hint}
            </span>
          )}
        </span>
        {selected ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
      </button>
    );
  };

  const renderAddRow = () => {
    const index = filtered.length;
    const active = index === highlight;
    return (
      <button
        key={`${listId}-add`}
        type="button"
        role="option"
        id={`${listId}-opt-${index}`}
        aria-selected={false}
        disabled={adding}
        onMouseEnter={() => setHighlight(index)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => void doAdd()}
        className={cn(
          "mt-1 flex w-full items-center gap-2 border-t border-border/70 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors",
          active && !adding
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:bg-muted",
          adding && "opacity-60"
        )}
      >
        {adding ? (
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-[1.5px] border-muted-foreground/30 border-t-foreground"
          />
        ) : (
          <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        )}
        <span className="min-w-0 truncate">
          {adding ? (
            "Adding…"
          ) : (
            <>Add “{trimmedValue}” to the choices</>
          )}
        </span>
      </button>
    );
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label ? (
        <label htmlFor={id} className="px-1 text-sm font-medium text-foreground">
          {label}
        </label>
      ) : null}

      <div ref={rootRef} className="relative">
        <div
          ref={fieldRef}
          data-state={hasError ? "error" : focused ? "focused" : "idle"}
          onClick={() => {
            if (disabled) return;
            inputRef.current?.focus();
            if (!open) setOpenSafe(true);
          }}
          className={cn(
            "relative flex w-full cursor-text items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors",
            "hover:border-(--color-border-strong) focus-within:ring-2 focus-within:ring-foreground/20",
            hasError && "border-destructive ring-2 ring-destructive/25",
            disabled && "pointer-events-none opacity-60",
            triggerClassName
          )}
        >
          <input
            ref={inputRef}
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && highlight >= 0 ? `${listId}-opt-${highlight}` : undefined
            }
            aria-invalid={hasError || undefined}
            aria-describedby={errorMessage ? `${id}-error` : undefined}
            disabled={disabled}
            autoComplete="off"
            value={value}
            {...rest}
            onChange={(e) => setValue(e.target.value)}
            onFocus={(e) => {
              setFocused(true);
              rest.onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              rest.onBlur?.(e);
            }}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-1 bg-transparent text-base leading-6 text-foreground caret-foreground outline-none placeholder:text-muted-foreground/60 disabled:cursor-not-allowed"
          />
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.focus();
              setOpenSafe(!open);
            }}
            className="shrink-0 text-muted-foreground"
          >
            <motion.span
              animate={{ rotate: open ? 180 : 0 }}
              transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.4, bounce: 0.3 }}
              className="block"
            >
              <ChevronDown className="h-4 w-4" />
            </motion.span>
          </button>
        </div>

        {/* Suggestion panel — SelectContent anatomy (rounded-xl, shadow, p-1). */}
        {open && (
          <div
            ref={panelRef}
            id={listId}
            role="listbox"
            aria-labelledby={id}
            className={cn(
              "absolute left-0 right-0 z-20 rounded-xl border border-border bg-background shadow-lg",
              placement === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
              contentClassName
            )}
          >
            <div className="max-h-60 overflow-y-auto p-1 scroll-thin">
              {filtered.length > 0 ? (
                <>
                  {filtered.map(renderItem)}
                  {showAddRow ? renderAddRow() : null}
                </>
              ) : showAddRow ? (
                renderAddRow()
              ) : (
                <p className="px-2.5 py-2 text-sm text-muted-foreground">
                  No matches — your typed text is kept.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className={reserveErrorLine ? "min-h-4" : "contents"}>
        <AnimatePresence initial={false}>
          {errorMessage ? (
            <motion.p
              id={`${id}-error`}
              role="alert"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, filter: "blur(4px)" }}
              transition={{ duration: 0.2 }}
              className="px-1 text-xs text-destructive"
            >
              {errorMessage}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
};

/** Allow `import Combobox from …` too. */
export default Combobox;
