"use client";

// ============================================================================
// RMIS — Account Settings (Task 35). The dedicated personal-settings page
// reached from the mobile Settings tab (HOME · JOBS · PROFILE · SETTINGS)
// and the desktop rail's account menu. Cards wear the official BEUI
// SignUpForm card language (the same tokens the sign-in / sign-up blocks and
// the profile 01–07 forms use — views/profile/beui-form.ts):
//   1. Appearance   — Dark mode & Light mode (theme persists per device,
//                     applied pre-paint by lib/theme-script).
//   2. Security     — Change password (official Input capsules + the
//                     auth-exact flag-once-left → clear-when-fixed lifecycle
//                     via useAuthErrors; login-grade re-verification server
//                     side at /api/auth/change-password).
//   3. Help & support — FUNCTIONAL (Task 36, per user): an inquiry form in
//                     the exact language of the frontpage Contact page
//                     (contact-view.tsx) — signed-in name + email prefilled,
//                     same useAuthErrors timing, same POST /api/contact —
//                     so the message lands as a ContactRequest visible to
//                     BOTH the HR team (EVALUATOR) and administrators
//                     (ADMIN) under Settings → Contact Requests. The
//                     official MIRDC HR channel rows stay below it.
//   4. Session      — Sign out (Task 36, per user: with the mobile Profile
//                     expandable's Account row removed, logout lives here).
// Task 36 — the Change password and Help & support cards are now
// COLLAPSIBLE and DEFAULT CLOSED (shadcn/radix Collapsible — the official
// ui/collapsible primitive): the card header is the toggle, the chevron
// flips, and the content is unmounted while closed. Appearance stays open.
// ============================================================================

import { useState, type FormEvent } from "react";
import {
  ChevronDown,
  LifeBuoy,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Moon,
  Phone,
  Sun,
  Tag,
  User,
} from "lucide-react";
import { PageHeader, IconChip, SegmentedControl } from "@/components/ui/shell";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/motion/input";
import { StatefulButton } from "@/components/motion/button/stateful";
import { Textarea } from "@/components/forms/textarea";
import { isEmailShape, useAuthErrors } from "@/components/forms/field-errors";
import { useSession } from "@/components/session-provider";
import { useTheme } from "@/lib/theme";
import { apiFetch } from "@/lib/client";
import { toast } from "@/lib/toast";
import { displayNameOf, performSignOut } from "@/components/shell/nav-rail";
import { cn } from "@/lib/utils";
import {
  BEUI_FIELD_FILL,
  BEUI_FORM_CARD,
  BEUI_FORM_DESCRIPTION,
  BEUI_FORM_FOOTER,
  BEUI_FORM_HEADER,
  BEUI_FORM_TITLE,
} from "./profile/beui-form";

type Status = "idle" | "busy" | "success";

/** One settings card — the official auth-block shell on the profile's
 *  cloud tile (the sanctioned surface, capsules stay white via bg-white). */
function SettingsCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`${BEUI_FORM_CARD} bg-cloud/60 p-6 ${className ?? ""}`}>
      {children}
    </section>
  );
}

/**
 * Collapsible settings card (Task 36, per user): the SAME official
 * auth-block shell, but the header row is the shadcn/radix Collapsible
 * trigger — the whole card collapses to its title + description, default
 * CLOSED. Content is unmounted while closed (Radix default), so the change
 * password / inquiry forms mount fresh on expand. The rotating chevron
 * mirrors the disclosure affordance.
 */
function CollapsibleCard({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SettingsCard>
        <CollapsibleTrigger className="group flex w-full min-h-[44px] items-start justify-between gap-4 rounded-xl text-left focus-ring">
          <span className={BEUI_FORM_HEADER}>
            <h2 className={BEUI_FORM_TITLE}>{title}</h2>
            <p className={BEUI_FORM_DESCRIPTION}>{description}</p>
          </span>
          <span
            aria-hidden="true"
            className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border border-divider bg-white text-stone transition-colors group-hover:text-ink"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-200",
                open && "rotate-180"
              )}
            />
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent>{children}</CollapsibleContent>
      </SettingsCard>
    </Collapsible>
  );
}

// MOM 2026-10-13 — approved contact details.
const SUPPORT_CHANNELS = [
  {
    icon: Phone,
    label: "Call us",
    value: "8837-0431 loc. 440/441",
    href: "tel:+63288370431,440",
  },
  {
    icon: Mail,
    label: "Email us",
    value: "recruitment@mirdc.dost.gov.ph",
    href: "mailto:recruitment@mirdc.dost.gov.ph",
  },
  {
    icon: MapPin,
    label: "Visit us",
    value: "MIRDC Compound, Gen. Santos Ave. Bicutan 1631, City of Taguig, Metro Manila 1631, Philippines",
  },
];

export default function AccountSettings() {
  const { user } = useSession();
  const { theme, setTheme } = useTheme();

  // ── Change password (official auth-exact lifecycle) ──────────────────────
  const [status, setStatus] = useState<Status>("idle");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Server verdict for the current-password check (login-grade, server side);
  // rendered on the current field and cleared the moment it is edited.
  const [serverError, setServerError] = useState<string | undefined>(undefined);

  const rules = {
    current: !currentPassword
      ? "Enter your current password."
      : undefined,
    next: !newPassword
      ? "Enter a new password."
      : newPassword.length < 6
        ? "Password must be at least 6 characters."
        : newPassword === currentPassword
          ? "New password must be different from your current password."
          : undefined,
    confirm: !confirmPassword
      ? "Confirm your new password."
      : confirmPassword !== newPassword
        ? "Passwords do not match."
        : undefined,
  };
  const { shown, touch, touchAll, reset, hasGaps } = useAuthErrors(rules);

  const submitPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError(undefined);
    touchAll();
    if (hasGaps || status === "busy") return;
    setStatus("busy");
    try {
      await apiFetch("/api/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
      });
      setStatus("success");
      toast.success("Password updated", {
        description: "Use your new password on your next sign-in.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      reset();
      setTimeout(() => setStatus("idle"), 2400);
    } catch (err) {
      setStatus("idle");
      const message = err instanceof Error ? err.message : "Could not update the password.";
      // The failed current-password check lands on its own field (reward
      // early: editing it clears the verdict) — other failures toast.
      if (/current password/i.test(message)) {
        setServerError(message);
        touch("current");
      } else {
        toast.error("Password not updated", { description: message });
      }
    }
  };

  // ── Help & support — inquiry form (the frontpage Contact page flow) ──────
  // Signed in, so the identity fields start prefilled from the session; the
  // submission goes to the SAME public endpoint the Contact page uses, so
  // the message lands in Settings → Contact Requests for BOTH the HR team
  // (EVALUATOR) and administrators (ADMIN).
  const [inqStatus, setInqStatus] = useState<"idle" | "busy" | "sent">("idle");
  const [inqName, setInqName] = useState(() => (user ? displayNameOf(user) : ""));
  const [inqEmail, setInqEmail] = useState(() => user?.email ?? "");
  const [inqSubject, setInqSubject] = useState("");
  const [inqMessage, setInqMessage] = useState("");

  const inquiryRules = {
    name: !inqName.trim() ? "Enter your full name." : undefined,
    email: !inqEmail.trim()
      ? "Enter your email address."
      : !isEmailShape(inqEmail.trim())
        ? "Enter a valid email address."
        : undefined,
    subject: !inqSubject.trim() ? "Enter a subject." : undefined,
    message: !inqMessage.trim() ? "Enter your message." : undefined,
  };
  const inquiry = useAuthErrors(inquiryRules);

  const submitInquiry = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    inquiry.touchAll();
    if (Object.values(inquiryRules).some(Boolean) || inqStatus === "busy") return;
    setInqStatus("busy");
    try {
      const res = await apiFetch<{ submitted: boolean; message: string }>("/api/contact", {
        method: "POST",
        body: {
          name: inqName.trim(),
          email: inqEmail.trim(),
          subject: inqSubject.trim(),
          message: inqMessage.trim(),
        },
      });
      if (res.submitted) {
        setInqStatus("sent");
        toast.success("Inquiry sent", { description: res.message });
      } else {
        setInqStatus("idle");
        toast.error(res.message || "Could not send your inquiry");
      }
    } catch (err) {
      setInqStatus("idle");
      toast.error(err instanceof Error ? err.message : "Could not send your inquiry");
    }
  };

  // "Send another inquiry" — reset subject/message (identity keeps its
  // prefill), reveal the form again.
  const resetInquiry = () => {
    setInqStatus("idle");
    setInqSubject("");
    setInqMessage("");
    inquiry.reset();
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        eyebrow="Settings"
        title="Account Settings"
        description="Personal preferences for your RMIS account — appearance, security and support."
      />

      {/* 1 · Appearance — Dark mode & Light mode (always open) */}
      <SettingsCard>
        <div className={BEUI_FORM_HEADER}>
          <h2 className={BEUI_FORM_TITLE}>Dark mode &amp; light mode</h2>
          <p className={BEUI_FORM_DESCRIPTION}>
            Choose how RMIS looks on this device. Your choice is remembered here.
          </p>
        </div>
        <div className="flex items-center justify-between gap-4">
          <SegmentedControl
            ariaLabel="Color theme"
            value={theme}
            onChange={(next) => setTheme(next)}
            options={[
              { value: "light", label: "Light", icon: Sun },
              { value: "dark", label: "Dark", icon: Moon },
            ]}
          />
          <p className="hidden text-xs text-stone sm:block" aria-live="polite">
            {theme === "dark" ? "Night canvas is on" : "Daylight canvas is on"}
          </p>
        </div>
      </SettingsCard>

      {/* 2 · Security — Change password (collapsible, default closed) */}
      <CollapsibleCard
        title="Change password"
        description={
          user
            ? `Updating the password for ${user.email}. Your current password is required.`
            : "Your current password is required."
        }
      >
        <form onSubmit={submitPassword} className="flex flex-col gap-1" noValidate>
          <Input
            id="current-password"
            label="Current password"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(v) => {
              setCurrentPassword(v);
              setServerError(undefined);
            }}
            onBlur={() => touch("current")}
            placeholder="Enter your current password"
            error={serverError ?? shown("current")}
            reserveErrorLine
            classNames={{ field: BEUI_FIELD_FILL }}
          />
          <Input
            id="new-password"
            label="New password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={setNewPassword}
            onBlur={() => touch("next")}
            placeholder="At least 6 characters"
            error={shown("next")}
            reserveErrorLine
            classNames={{ field: BEUI_FIELD_FILL }}
          />
          <Input
            id="confirm-password"
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            onBlur={() => touch("confirm")}
            placeholder="Re-enter your new password"
            error={shown("confirm")}
            reserveErrorLine
            classNames={{ field: BEUI_FIELD_FILL }}
          />
          <StatefulButton
            type="submit"
            size="lg"
            state={status === "busy" ? "loading" : status === "success" ? "success" : "idle"}
            loadingText="Updating"
            successText="Password updated"
            className="mt-4 w-full"
          >
            Update password
          </StatefulButton>
          <p className={BEUI_FORM_FOOTER}>
            Changed passwords apply on your next sign-in.
          </p>
        </form>
      </CollapsibleCard>

      {/* 3 · Help & support (collapsible, default closed) — the functional
          inquiry form mirrors the frontpage Contact page: same fields, same
          official error timing, same endpoint. HR (EVALUATOR) and ADMIN both
          read the submission in Settings → Contact Requests. */}
      <CollapsibleCard
        title="Help & support"
        description="Send a message to the MIRDC HR team — it lands in the HR and administrator queue — or reach the office through these channels."
      >
        {inqStatus === "sent" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <IconChip icon={LifeBuoy} tone="blue" size={48} iconSize={24} />
            <h3 className="text-2xl font-medium leading-[1.1] text-ink">
              Inquiry received
            </h3>
            <p className="max-w-sm text-sm leading-relaxed text-body-gray">
              Thank you, your request is now in the HR queue. The team responds
              through your email address.
            </p>
            <button type="button" onClick={resetInquiry} className="dlg-ghost mt-2 min-h-[44px] px-6 text-sm">
              Send another inquiry
            </button>
          </div>
        ) : (
          <form onSubmit={submitInquiry} className="flex w-full flex-col gap-5" noValidate>
            <Input
              id="support-name"
              label="Full name"
              autoComplete="name"
              value={inqName}
              onChange={setInqName}
              onBlur={() => inquiry.touch("name")}
              placeholder="Your full name"
              leftIcon={<User />}
              maxLength={120}
              error={inquiry.shown("name")}
              reserveErrorLine
              classNames={{ field: BEUI_FIELD_FILL }}
            />
            <Input
              id="support-email"
              label="Email address"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={inqEmail}
              onChange={setInqEmail}
              onBlur={() => inquiry.touch("email")}
              placeholder="you@example.gov.ph"
              leftIcon={<Mail />}
              maxLength={200}
              error={inquiry.shown("email")}
              reserveErrorLine
              classNames={{ field: BEUI_FIELD_FILL }}
            />
            <Input
              id="support-subject"
              label="Subject"
              value={inqSubject}
              onChange={setInqSubject}
              onBlur={() => inquiry.touch("subject")}
              placeholder="e.g. Clarification on my application status"
              leftIcon={<Tag />}
              maxLength={200}
              error={inquiry.shown("subject")}
              reserveErrorLine
              classNames={{ field: BEUI_FIELD_FILL }}
            />
            <Textarea
              id="support-message"
              label="Message"
              value={inqMessage}
              onChange={setInqMessage}
              onBlur={() => inquiry.touch("message")}
              placeholder="How can we help?"
              maxLength={4000}
              error={inquiry.shown("message")}
              reserveErrorLine
              classNames={{ field: BEUI_FIELD_FILL, textarea: "min-h-[120px]" }}
            >
              <p className="px-1 text-xs text-stone">Up to 4,000 characters.</p>
            </Textarea>
            <StatefulButton
              type="submit"
              size="lg"
              state={inqStatus === "busy" ? "loading" : "idle"}
              loadingText="Sending"
              className="w-full"
            >
              Send inquiry
            </StatefulButton>
            <p className={BEUI_FORM_FOOTER}>
              Your message goes straight to the HR and administrator queue — both
              teams see it and reply through your email.
            </p>
          </form>
        )}

        {/* Official MIRDC HR channels — the same rows, below the form */}
        <ul className="flex flex-col gap-3">
          {SUPPORT_CHANNELS.map((c) => {
            const Icon = c.icon;
            const body = (
              <>
                <IconChip icon={Icon} tone="blue" size={40} iconSize={18} />
                <span className="min-w-0 flex-1">
                  <span className="eyebrow block">{c.label}</span>
                  <span className="mt-0.5 block text-sm font-medium text-foreground">
                    {c.value}
                  </span>
                </span>
              </>
            );
            return (
              <li key={c.label}>
                {c.href ? (
                  <a
                    href={c.href}
                    className="dlg-card-plain flex items-center gap-3.5 rounded-2xl p-3.5 transition-shadow hover:shadow-e2 focus-ring"
                  >
                    {body}
                  </a>
                ) : (
                  <div className="dlg-card-plain flex items-center gap-3.5 rounded-2xl p-3.5">
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <p className="flex items-start gap-2 text-center text-sm text-muted-foreground sm:justify-center">
          <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            For locked accounts or sign-in trouble, call the HR line during office
            hours (8:00 AM – 5:00 PM, Monday to Friday).
          </span>
        </p>
      </CollapsibleCard>

      {/* 4 · Session — Sign out (Task 36, per user: logout lives on this
          page now that the mobile Profile expandable no longer carries the
          Account identity card). */}
      <SettingsCard>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-medium text-foreground">
              Sign out
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              End your session on this device. You can sign back in any time.
            </p>
          </div>
          <button
            type="button"
            onClick={performSignOut}
            className="dlg-ghost inline-flex min-h-[44px] shrink-0 items-center gap-2 px-5 text-sm"
            style={{ color: "var(--bad)" }}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out
          </button>
        </div>
      </SettingsCard>

      {/* Screen-reader anchor so the security card is findable from the nav. */}
      <span id="account-security" className="sr-only">
        <Lock aria-hidden="true" /> Security settings
      </span>
    </div>
  );
}
