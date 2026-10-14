"use client"

import * as React from "react"

import {
  CenterMorphModal,
  CenterMorphModalClose,
  CenterMorphModalContent,
  CenterMorphModalTrigger,
} from "@/components/motion/center-morph-modal"
import { cn } from "@/lib/utils"

/**
 * RMIS modal shell — composes the OFFICIAL BEUI Center Morph Modal
 * (src/components/motion/center-morph-modal.tsx, installed verbatim from
 * beui.dev/r/center-morph-modal). The surface, center-unfold animation,
 * blurred backdrop, focus trap, scroll lock and dismiss behavior are 100%
 * official BEUI; this file only maps the long-standing RMIS Dialog API onto
 * it so existing call sites keep their shape.
 *
 * Migration notes (BEUI phase 6):
 * - Accessible names now flow through the official `ariaLabel` prop, which
 *   is REQUIRED on DialogContent (the official panel announces itself with
 *   it). Pass the same string your DialogTitle renders.
 * - DialogTrigger/DialogClose wrap a single interactive element (official
 *   cloneElement contract), matching how rail-journey-info already used
 *   Radix's asChild trigger.
 * - DialogHeader/Title/Description/Footer remain plain RMIS layout markup
 *   inside the official panel (Title is an <h2>, Description a <p>).
 * - The old Radix portal/overlay exports are gone — the official component
 *   portals, layers and dims on its own.
 */

function Dialog({
  ...props
}: {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}) {
  return <CenterMorphModal {...props} />
}

function DialogTrigger({ children }: { children: React.ReactElement }) {
  return (
    <CenterMorphModalTrigger>{children}</CenterMorphModalTrigger>
  )
}

function DialogClose({ children }: { children: React.ReactElement }) {
  return (
    <CenterMorphModalClose>{children}</CenterMorphModalClose>
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ariaLabel,
}: {
  className?: string
  children?: React.ReactNode
  showCloseButton?: boolean
  /** Accessible name for the modal surface (official required prop). */
  ariaLabel: string
}) {
  return (
    <CenterMorphModalContent
      ariaLabel={ariaLabel}
      showCloseButton={showCloseButton}
      // Legacy RMIS dialog anatomy: single-column grid with gap, p-6 padding,
      // lg max width — same defaults the Radix shell used, so every existing
      // call site keeps its layout (call-site classNames still win).
      className={cn(
        "grid grid-cols-[minmax(0,1fr)] gap-4 p-6 sm:max-w-lg",
        className
      )}
    >
      {children}
    </CenterMorphModalContent>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="dialog-title"
      className={cn(
        "font-display text-xl leading-tight tracking-[0.01em] text-ink",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="dialog-description"
      className={cn("text-sm leading-relaxed text-stone", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
}
