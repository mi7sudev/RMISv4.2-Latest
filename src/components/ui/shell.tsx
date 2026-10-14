"use client";

// ============================================================================
// RMIS — shared presentation primitives (Bevel edition).
// upload/PROPOSED-RMIS-DESIGN.md: white editorial canvas, pale Cloud Card
// geometry (24px radius, no borders, no shadows — the surface IS the
// elevation), Ink 600 display headings with tight tracking, stone eyebrows,
// monochrome chrome with metric accents rationed to data visuals.
// PageHeader, StatusPill, KpiCard, EmptyState, SectionCard, Monogram,
// SkeletonBlocks. Pure presentation: no fetching, no business logic.
// ============================================================================

import * as React from "react";
import { AlertCircle, ArrowLeft, Check, Clock, History, Minus, RefreshCw, Send, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ghostBtn } from "@/components/ui/buttons";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/motion/card";
import { getStatusMeta } from "@/lib/status";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import {
  BADGE_STATUS,
  variantForStatus,
  variantForVerdict,
  type StatusVariant,
} from "@/lib/status-ui";

/** Shared dialog scroll container class — one scroll anatomy for every dialog. */
export const dialogScroll = "max-h-[92dvh] overflow-y-auto scroll-thin";

// ── PageHeader ──────────────────────────────────────────────────────────────
// The single enterprise page-header anatomy used by EVERY view:
// optional labelled back link (detail views) → eyebrow → title row
// (title + titleAside badge) → description → meta row, with the action
// cluster right-aligned and stacked below the title below xl.
// ────────────────────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  back,
  leading,
  titleAside,
  meta,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  /** Detail-view affordance: labelled back link rendered above the title. */
  back?: { label: string; onClick: () => void };
  /** Avatar / icon lockup rendered left of the title block. */
  leading?: React.ReactNode;
  /** Badge / status pill rendered inline after the title. */
  titleAside?: React.ReactNode;
  /** Secondary row under the description (pills, stamps, counts). */
  meta?: React.ReactNode;
  className?: string;
}) {
  // NOTE: no self animation — AppShell owns the view mount transition, and a
  // second fade inside the header produced a double-fade on every navigation.
  return (
    <header className={className}>
      {back ? (
        <button
          type="button"
          onClick={back.onClick}
          className="focus-ring -ml-3 mb-3 inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 text-sm font-medium text-stone transition-colors hover:bg-cloud hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {back.label}
        </button>
      ) : null}
      {/* Stacks below xl so wide action clusters (filters, toggles, refresh) can
          never squeeze the title into a truncated stub on tablet widths. */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          {leading ? <div className="shrink-0">{leading}</div> : null}
          <div className="min-w-0">
            {eyebrow ? (
              <p className="eyebrow mb-1.5">{eyebrow}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h1 className="font-display truncate text-2xl font-medium tracking-[0.01em] text-ink sm:text-[28px]">
                {title}
              </h1>
              {titleAside}
            </div>
            {description ? (
              typeof description === "string" ? (
                <p className="mt-1.5 text-sm leading-relaxed text-stone">{description}</p>
              ) : (
                <div className="mt-1.5 text-sm leading-relaxed text-stone">{description}</div>
              )
            ) : null}
            {meta ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">{meta}</div>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

// ── StatusPill ──────────────────────────────────────────────────────────────

// THE one status pill — the official BEUI AnimatedBadge
// (beui.dev/components/motion/animated-badge) wearing the RMIS domain
// vocabulary: the normalized status label ("UNDER_REVIEW" renders as "Under
// Review") and the variant auto-maps from the status tone unless explicitly
// overridden (used for non-application labels such as verdicts, completion or
// document states). Label/status changes roll via the badge's built-in motion.
//
// `pulse` opts a pill into the BEUI "loading"/syncing state (spinning
// LoaderCircle + breathing tint) while KEEPING the domain label — e.g. the
// applicant's Application Progress card renders its "In Review" badge as the
// syncing badge (user directive: same badge as the docs' "Syncing", word
// changed to "In Review"). Hue is unaffected: loading shares the info tint.
export function StatusPill({
  status,
  variant,
  pulse = false,
  className,
}: {
  /** Raw stored status spelling (normalized internally). */
  status?: string | null;
  /** Explicit variant overrides the status→tone mapping. */
  variant?: StatusVariant;
  /** Render the BEUI syncing badge (spinner + pulse) with the same label. */
  pulse?: boolean;
  className?: string;
}) {
  const meta = status ? getStatusMeta(status) : null;
  const v: StatusVariant = variant ?? (meta ? variantForStatus(status) : "neutral");
  const label = meta ? meta.label : (status ?? "");
  return (
    <AnimatedBadge
      status={pulse ? "loading" : BADGE_STATUS[v]}
      size="sm"
      className={cn("shrink-0", className)}
      contentKey={label}
    >
      {label}
    </AnimatedBadge>
  );
}

// ── VerdictPill ─────────────────────────────────────────────────────────────

function verdictMeta(verdict: string): { chip: string; variant: StatusVariant } {
  switch (verdict) {
    case "ALL_MET":
      return { chip: "Qualified", variant: variantForVerdict("Qualified") };
    case "PARTIAL":
      return { chip: "Partial", variant: variantForVerdict("Partial") };
    case "NONE_MET":
      return { chip: "Not qualified", variant: variantForVerdict("Not qualified") };
    case "NEEDS_REVIEW":
      return { chip: "Verify", variant: variantForVerdict("Verify") };
    case "NO_REQUIREMENTS":
      return { chip: "No reqs", variant: variantForVerdict("No reqs") };
    default:
      return { chip: verdict, variant: variantForVerdict(verdict) };
  }
}

/** MQR verdict pill for queue cards / list rows (null when no verdict) —
 *  the official BEUI AnimatedBadge over the verdict vocabulary. */
export function VerdictPill({
  verdict,
  className,
}: {
  verdict: string | null | undefined;
  className?: string;
}) {
  if (!verdict) return null;
  const vm = verdictMeta(verdict);
  return (
    <AnimatedBadge
      status={BADGE_STATUS[vm.variant]}
      size="sm"
      className={cn("shrink-0", className)}
      contentKey={vm.chip}
    >
      {vm.chip}
    </AnimatedBadge>
  );
}

// ── PriorRejectionPill ──────────────────────────────────────────────────────

/** MOM 2026-10-13 — "previously rejected for this posting" status pill (user
 *  QA: promoted from a bottom credential tag to a first-class status badge —
 *  placed before the match-percentage badge on kanban cards and stacked into
 *  the Status column of the review-queue list). Amber warn tone, History
 *  glyph; the label compacts to "Rejected ×N" under sm so it fits the 134px
 *  mobile Status column without truncation. Hidden when count = 0. */
export function PriorRejectionPill({
  count,
  className,
}: {
  count: number | null | undefined;
  className?: string;
}) {
  if (!count || count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex max-w-full shrink-0 items-center gap-1 rounded-full bg-[var(--warn-bg)] px-2 py-[3px] text-[11px] font-medium leading-none text-[var(--warn)]",
        className
      )}
      aria-label={`Previously rejected ${count} ${count === 1 ? "time" : "times"} for this posting`}
    >
      <History className="h-3 w-3 shrink-0" aria-hidden />
      <span className="hidden sm:inline">Previously rejected</span>
      <span className="sm:hidden">Rejected</span>
      <span className="num">×{count}</span>
    </span>
  );
}

// ── Name initials + monogram avatar ─────────────────────────────────────────

/** First letters of the first two words, uppercase ("Juan Cruz" → "JC"). */
export function nameInitials(name: string | null | undefined): string {
  return (
    (name || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/** Gradient monogram avatar with initials derived from the name. */
export function MonogramAvatar({
  name,
  size = 36,
  warm = false,
  className,
}: {
  name: string;
  size?: number;
  warm?: boolean;
  className?: string;
}) {
  return (
    <span aria-hidden="true">
      <Monogram size={size} warm={warm} className={cn("rounded-full", className)}>
        {nameInitials(name)}
      </Monogram>
    </span>
  );
}

// ── SegmentedControl ────────────────────────────────────────────────────────
// Mode/view switchers (Kanban⇄List, tab families): fog track + white active
// pill. One anatomy for every segmented control in the app.

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string; icon?: LucideIcon }[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("inline-flex items-center rounded-full bg-fog p-1", className)}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "focus-ring inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
              active ? "bg-white text-ink shadow-e1" : "text-stone hover:text-ink"
            )}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" aria-hidden="true" /> : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ── FilterChip ──────────────────────────────────────────────────────────────
// Filter/segment chips where the ACTIVE state carries the brand blue (stage
// tabs, contact filters) — the system-wide blue-fill language for selection.

export function FilterChip({
  active,
  onClick,
  children,
  count,
  className,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count?: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-full px-3.5 text-xs font-medium transition-all focus-ring",
        active
          ? "bg-primary text-primary-foreground shadow-cta hover:bg-primary-hover"
          : "border border-[#dfe6f0] bg-white text-stone shadow-[0_1px_2px_rgba(31,32,37,0.04)] hover:bg-fog hover:text-ink",
        className
      )}
    >
      {children}
      {typeof count === "number" ? (
        <span className={cn("num text-[10px]", active ? "opacity-80" : "text-ash")}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

// ── StatusDot ───────────────────────────────────────────────────────────────

/** Semantic Lucide glyph inside each tinted chip — the shape carries the state
 *  so the hue is reinforcement, never the sole signal. Same icon language as
 *  the CSS-masked status pills: ok=check · warn=clock · bad=x · info=send ·
 *  neutral=minus. Clean stroke icons (no disc-in-disc knockouts). */
const STATUS_DOT_GLYPH: Record<StatusVariant, LucideIcon> = {
  ok: Check,
  warn: Clock,
  bad: X,
  info: Send,
  neutral: Minus,
};

/** Icon status chip — a soft tinted disc with the state's stroke glyph in the
 *  matching strong hue. Replaces the bare color-only stage dots in pipelines,
 *  funnels and timelines. */
export function StatusDot({
  variant,
  className,
}: {
  variant: StatusVariant;
  className?: string;
}) {
  const Glyph = STATUS_DOT_GLYPH[variant];
  return (
    <span aria-hidden="true" className={cn("status-dot", `dot-${variant}`, className)}>
      <Glyph strokeWidth={2.75} />
    </span>
  );
}

// ── Monogram (Charcoal identity avatar) ─────────────────────────────────────

export function Monogram({
  children,
  warm = false,
  className,
  size = 36,
}: {
  children: React.ReactNode;
  warm?: boolean;
  className?: string;
  size?: number;
}) {
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.round(size * 0.34) }}
      className={cn("monogram", warm && "monogram-warm", className)}
    >
      {children}
    </span>
  );
}

// ── Tinted icon chip ────────────────────────────────────────────────────────

export type ChipTone = "amber" | "blue" | "emerald" | "rose" | "slate" | "ink" | "gold" | "plum";

export function IconChip({
  icon: Icon,
  tone = "slate",
  size = 40,
  iconSize,
  className,
}: {
  icon: LucideIcon;
  tone?: ChipTone;
  size?: number;
  iconSize?: number;
  className?: string;
}) {
  return (
    <span
      style={{ width: size, height: size }}
      className={cn("chip", `chip-${tone}`, className)}
      aria-hidden="true"
    >
      <Icon style={{ width: iconSize ?? Math.round(size * 0.46), height: iconSize ?? Math.round(size * 0.46) }} />
    </span>
  );
}

// ── KpiCard ─────────────────────────────────────────────────────────────────
// Bevel Cloud Feature Card anatomy: #ebf0f8 surface, 24px radius, NO border,
// NO shadow, 32px padding (p-8). The eyebrow labels the metric; the oversized
// tabular numeral is the hero.

const TONE_CHIP: Record<NonNullable<KpiCardProps["tone"]>, ChipTone> = {
  ok: "emerald",
  warn: "gold",
  bad: "rose",
  info: "plum",
  neutral: "slate",
};

export type KpiCardProps = {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: "ok" | "warn" | "bad" | "info" | "neutral";
  onClick?: () => void;
  ariaLabel?: string;
  className?: string;
  /** Optional decorative trailing element (sparkline, delta, etc.). */
  aside?: React.ReactNode;
};

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  onClick,
  ariaLabel,
  className,
  aside,
}: KpiCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="eyebrow pt-0.5">{label}</p>
        {Icon ? <IconChip icon={Icon} tone={TONE_CHIP[tone]} size={40} /> : null}
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="num text-[34px] font-medium leading-none tracking-[0.01em] text-ink">{value}</span>
          {hint ? <span className="text-xs font-medium text-pebble">{hint}</span> : null}
        </div>
        {aside}
      </div>
    </>
  );

  // BEUI Phase 5: the surface is now the OFFICIAL BEUI Card
  // (beui.dev/r/card, vendored verbatim at src/components/motion/card.tsx).
  // Clickable KPIs keep the real <button> wrapper for keyboard/AT semantics;
  // the official Card's `interactive` flag carries the hover/press feedback.
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={ariaLabel ?? label} className={cn("block w-full text-left", className)}>
        <Card interactive className="w-full">
          <CardContent className="flex flex-col">{body}</CardContent>
        </Card>
      </button>
    );
  }
  return (
    <Card className={className}>
      <CardContent className="flex flex-col">{body}</CardContent>
    </Card>
  );
}

// ── StatLedger ──────────────────────────────────────────────────────────────
// The institutional stat band: a Cloud Card band (24px radius) whose white
// cells are separated by hairline 1px gaps that let the pale surface show
// through — no floating cards, no icon chips. The oversized tabular numeral
// is the hero; a stone eyebrow labels it and a body-gray caption quietly
// qualifies it.

export function StatLedger({
  children,
  className,
  ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  /** Pass "none" when the caller renders its own skeleton geometry. */
  ariaLabel?: string;
}) {
  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        "dlg-card grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white xl:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  );
}

export function StatCell({
  label,
  value,
  hint,
  aside,
  onClick,
  ariaLabel,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** Trailing node on the numeral baseline (sparkline, delta, pill). */
  aside?: React.ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const body = (
    <>
      <p className="eyebrow">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="num text-[44px] font-medium leading-none tracking-[0.01em] text-ink">{value}</p>
        {aside}
      </div>
      {hint ? <p className="mt-2 text-xs text-body-gray">{hint}</p> : null}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ?? label}
        className="focus-ring block w-full rounded-none bg-transparent p-5 text-left transition-colors hover:bg-white/70 sm:p-6"
      >
        {body}
      </button>
    );
  }
  return <div className="p-5 sm:p-6">{body}</div>;
}

/** Skeleton twin of StatLedger — identical geometry, shimmer cells. */
export function StatLedgerSkeleton({ count = 4 }: { count?: number }) {
  return (
    <StatLedger aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-5 sm:p-6">
          <div className="skel h-3 w-20" />
          <div className="skel mt-4 h-10 w-16" />
          <div className="skel mt-3 h-3 w-24" />
        </div>
      ))}
    </StatLedger>
  );
}

// ── EmptyState ──────────────────────────────────────────────────────────────

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  tone = "slate",
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
  tone?: ChipTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 text-center",
        compact ? "min-h-[104px] py-6" : "min-h-[176px] py-10",
        className
      )}
    >
      <span
        className={cn(
          "chip mb-4 rounded-full",
          `chip-${tone}`,
          compact ? "h-10 w-10" : "h-14 w-14"
        )}
      >
        <Icon className={compact ? "h-4 w-4" : "h-6 w-6"} aria-hidden="true" />
      </span>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-[13px] leading-5 text-stone">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

// ── SectionCard ─────────────────────────────────────────────────────────────
// Bevel Cloud Feature Card: #ebf0f8 surface, 24px radius, no border, no
// shadow, 32px padding (p-6 keeps in-app density; p-8 on wide screens).

export function SectionCard({
  title,
  description,
  actions,
  icon: Icon,
  chipTone,
  children,
  className,
  bodyClassName,
  /** "cloud" = pale Cloud Card (default) · "plain" = white panel for content
   *  sitting inside dialogs / on cloud surfaces (profile section anatomy). */
  variant = "cloud",
  /** Task 39 (per user, mobile): drop the card chrome below sm — no border,
   *  surface, radius or inset — so the section reads as a plain heading over
   *  the page and the INNER groups (profile disclosure cards, entry cards)
   *  become the only containers. Kills the card-inside-a-card nesting on
   *  phones. sm+ rendering is unchanged. */
  bareOnMobile = false,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  icon?: LucideIcon;
  chipTone?: ChipTone;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  variant?: "cloud" | "plain";
  bareOnMobile?: boolean;
}) {
  const bare = bareOnMobile
    ? "max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:py-0 max-sm:gap-2"
    : undefined;
  const bareInset = bareOnMobile ? "max-sm:px-0" : undefined;
  // min-w-0: as a CSS-grid child the card must be allowed to shrink below the
  // min-content floor of its nowrap description, or the grid track blows out
  // and the card overflows its viewport (observed at 320–1279px).
  //
  // BEUI Phase 5: the surface is now composed from the OFFICIAL BEUI Card
  // parts (beui.dev/r/card, vendored verbatim at src/components/motion/card.tsx)
  // — Card / CardHeader / CardTitle / CardDescription / CardAction /
  // CardContent — used unmodified. The RMIS prop API (title/description/
  // actions/icon/chipTone/variant/bodyClassName) is unchanged, so every
  // call site inherits the BEUI card with zero churn. variant maps
  // cloud → size "default", plain (dialog panels) → size "compact".
  return (
    <Card
      size={variant === "plain" ? "compact" : "default"}
      className={cn("min-w-0", bare, className)}
      aria-label={title}
    >
      {title || actions ? (
        <CardHeader className={bareInset}>
          <div className="flex min-w-0 items-center gap-3">
            {Icon ? (
              <IconChip
                icon={Icon}
                tone={chipTone ?? "slate"}
                size={36}
                iconSize={16}
              />
            ) : null}
            <div className="min-w-0">
              {/* Bare (mobile) sections let the title wrap onto a second line
                  instead of truncating against the header actions. */}
              <CardTitle
                as="h2"
                className={cn(
                  "font-display text-lg leading-7 text-ink",
                  bareOnMobile ? "max-sm:whitespace-normal" : "truncate"
                )}
              >
                {title}
              </CardTitle>
              {/* Wraps below sm, truncates from sm up. Full-width nowrap (truncate
                  everywhere) gave the card a huge min-content floor that blew out
                  auto grid tracks on phones; wrapping text has none. */}
              {description ? (
                <CardDescription className="text-xs text-stone sm:truncate">
                  {description}
                </CardDescription>
              ) : null}
            </div>
          </div>
          {actions ? (
            <CardAction
              className={
                bareOnMobile
                  ? // Below sm the actions drop to their own full-width row
                    // under the title (the header grid gains a second row),
                    // so long titles like "Personal Information" wrap freely.
                    "max-sm:col-start-1 max-sm:row-span-1 max-sm:row-start-2 max-sm:w-full"
                  : undefined
              }
            >
              <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
            </CardAction>
          ) : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn(bareInset, bodyClassName)}>{children}</CardContent>
    </Card>
  );
}

// ── Skeleton blocks ─────────────────────────────────────────────────────────

export function SkeletonKpis({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 lg:grid-cols-4", className)} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="dlg-card p-6">
          <div className="flex items-start justify-between">
            <div className="skel h-3 w-20" />
            <div className="skel h-10 w-10 rounded-full" />
          </div>
          <div className="skel mt-4 h-8 w-16" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({
  rows = 6,
  className,
  rowClassName = "h-14",
}: {
  rows?: number;
  className?: string;
  rowClassName?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cn("skel w-full", rowClassName)} />
      ))}
    </div>
  );
}

export function SkeletonKanban({ columns = 4, className }: { columns?: number; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-4 xl:grid-cols-4", className)} aria-hidden="true">
      {Array.from({ length: columns }).map((_, i) => (
        /* Pale cloud column panel + floating card blocks (mirrors KanbanColumn) */
        <div key={i} className="flex flex-col gap-2 rounded-2xl bg-cloud p-2.5">
          <div className="flex items-center gap-2 px-1 pb-0.5 pt-0.5">
            <div className="skel h-2 w-2 rounded-full" />
            <div className="skel h-3.5 w-20" />
            <div className="ml-auto skel h-5 w-6 rounded-full" />
          </div>
          <div className="skel h-24 w-full rounded-2xl" />
          <div className="skel h-24 w-full rounded-2xl" />
        </div>
      ))}
    </div>
  );
}

// ── QuickFact ───────────────────────────────────────────────────────────────
// The canonical job/record fact lockup: stone eyebrow label over a tabular
// semibold value. Used on job cards, detail panes and summaries.

export function QuickFact({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="eyebrow">{label}</p>
      <p className="num mt-1 truncate text-sm font-medium text-ink">{value}</p>
    </div>
  );
}

// ── EmptyNote ───────────────────────────────────────────────────────────────
// Quiet text-only empty line for bounded lists inside dialogs/panels
// (full-card states use EmptyState).

export function EmptyNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("py-6 text-center text-sm text-body-gray", className)}>{children}</p>;
}

// ── LedgerRow ───────────────────────────────────────────────────────────────
// Hairline label/value row for dossier ledgers. Values shrink and wrap so
// long emails/URLs can never force a dialog's grid track wider.

export function LedgerRow({
  label,
  value,
  num = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  num?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 border-b border-divider py-2.5 last:border-0", className)}>
      <span className="shrink-0 pt-0.5 text-xs text-stone">{label}</span>
      <span className={cn("min-w-0 break-words text-right text-sm text-ink", num && "num")}>
        {value === "" || value === null || value === undefined ? "-" : value}
      </span>
    </div>
  );
}

// ── Pagination ──────────────────────────────────────────────────────────────
// The ONE pagination control: compact 36px ghost capsules, count on the left,
// controls right-aligned (table-density exception to the 44px rule).

export function Pagination({
  page,
  pageCount,
  total,
  onPage,
  unit = "results",
  className,
}: {
  page: number;
  pageCount: number;
  total?: number;
  onPage: (next: number) => void;
  unit?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 pt-4", className)}>
      <p className="num text-xs text-body-gray">
        {typeof total === "number" ? `${total} ${unit}` : `Page ${page} of ${Math.max(pageCount, 1)}`}
        {typeof total === "number" ? ` · page ${page} of ${Math.max(pageCount, 1)}` : ""}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="dlg-ghost inline-flex min-h-[36px] items-center gap-1.5 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className="dlg-ghost inline-flex min-h-[36px] items-center gap-1.5 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-50"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

// ── StatTile ────────────────────────────────────────────────────────────────
// The ONE in-panel stat tile: cloud card · eyebrow · oversized tabular num.
// Page-level KPI bands use KpiCard (icon chip + context line); panels that
// already carry their own section icon (settings audit/SMS/email) use this
// quieter sibling so the recipe exists in exactly one place.

export function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="dlg-card p-6">
      <p className="eyebrow">{label}</p>
      <p className="num mt-4 text-3xl font-medium tracking-[0.01em] text-ink">{value ?? "-"}</p>
    </div>
  );
}

// ── ErrorCard ───────────────────────────────────────────────────────────────
// The ONE load-failure state: cloud card + rose EmptyState + Retry. Replaces
// the four hand-rolled skins (review-queue, profile-view, applicant-home,
// jobs-view) that had drifted in padding, icon and button copy.

export function ErrorCard({
  title = "Something went wrong",
  description,
  onRetry,
  retryLabel = "Retry",
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("dlg-card p-6 sm:p-8", className)}>
      <EmptyState
        icon={AlertCircle}
        tone="rose"
        title={title}
        description={description}
        action={
          onRetry ? (
            <button type="button" className={ghostBtn} onClick={onRetry}>
              {retryLabel}
            </button>
          ) : undefined
        }
      />
    </div>
  );
}

// ── NoteBanner ──────────────────────────────────────────────────────────────
// Quiet informational note (role="note") for scope/permission context lines.
// One recipe instead of per-view copies.

export function NoteBanner({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <p className="rounded-xl bg-cloud/70 px-4 py-2.5 text-xs leading-relaxed text-stone" role="note">
      <span className="font-medium text-ink">{label}:</span> {children}
    </p>
  );
}

// ── RefreshButton ───────────────────────────────────────────────────────────
// The ONE manual-refresh control: ghost capsule + spinning RefreshCw glyph.
// Owns the spin state internally — call sites pass their reload callback and
// drop their local `spin` useState.

export function RefreshButton({
  onRefresh,
  label = "Refresh",
  className,
}: {
  onRefresh: () => void | Promise<unknown>;
  label?: string;
  className?: string;
}) {
  const [spin, setSpin] = React.useState(false);
  return (
    <button
      type="button"
      className={cn(ghostBtn, className)}
      onClick={() => {
        setSpin(true);
        void Promise.resolve(onRefresh()).finally(() => setTimeout(() => setSpin(false), 500));
      }}
    >
      <RefreshCw className={cn("h-4 w-4", spin && "animate-spin")} aria-hidden />
      {label}
    </button>
  );
}

// ── RichSection ─────────────────────────────────────────────────────────────
// The ONE rich-text posting section: HTML when present, else pre-line plain
// text, otherwise nothing. `heading="md"` renders the card-embedded scale
// (h3 / text-sm — job workspace posting sections); "lg" renders the
// standalone scale (h4 / text-base→lg — applicant application modal).

export function RichSection({
  title,
  text,
  html,
  heading = "lg",
}: {
  title: string;
  text?: string | null;
  html?: string | null;
  heading?: "md" | "lg";
}) {
  const body =
    html && html.trim() ? (
      <div
        className={cn("rich-text text-sm leading-relaxed text-body-gray", heading === "lg" ? "" : "mt-2")}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    ) : text && text.trim() ? (
      <p className={cn("whitespace-pre-line text-sm leading-relaxed text-body-gray", heading === "lg" ? "" : "mt-2")}>
        {text}
      </p>
    ) : null;
  if (!body) return null;
  return (
    <section className={heading === "lg" ? "space-y-2" : undefined}>
      {heading === "lg" ? (
        <h4 className="text-base font-medium text-ink sm:text-lg">{title}</h4>
      ) : (
        <h3 className="text-sm font-medium text-ink">{title}</h3>
      )}
      {body}
    </section>
  );
}
