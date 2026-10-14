"use client";

// ============================================================================
// RMIS — Public contact view (QA 2026-02, ADMIN/EVALUATOR "Contact Requests —
// management of inquiries or requests submitted through the system"). A simple
// and honest inquiry form for applicants and employees; submissions land in
// Settings → Contact Requests for the HR team. Rendered inside PublicShell.
// Task 31 — the sign-in/sign-up error contract applies: no disabled-for-gaps,
// official Input `error` shake, reward early.
// Task 32 — the form now CARRIES THE SIGN-IN/SIGN-UP LOOK exactly: the
// official SignUpForm block's card anatomy (rounded-3xl bordered white card,
// single-column gap-5 field flow, icon-led capsules, reserved error lines),
// the block's StatefulButton submit lifecycle, and the block's EXACT error
// timing via useAuthErrors — "flags a field only once it is left, then clears
// the moment it is fixed" (rules derived on every render; touch on blur;
// submit reveals all gaps at once). Handlers, endpoint, and copy preserved.
// Field-visibility pass: the card is the profile forms' cloud/60 surface, so
// every field capsule (3 Inputs + the Textarea) is pinned white through the
// official classNames.field prop with the shared BEUI_FIELD_FILL token —
// the official capsules ship with NO fill and would vanish into the tint.
// ============================================================================

import { useState } from "react";
import type { FormEvent } from "react";
import { LifeBuoy, Mail, MapPin, Phone, Tag, User } from "lucide-react";
import { toast } from "@/lib/toast";
import { Input } from "@/components/motion/input";
import { StatefulButton } from "@/components/motion/button";
import { Textarea } from "@/components/forms/textarea";
import { isEmailShape, useAuthErrors } from "@/components/forms/field-errors";
import { IconChip, PageHeader } from "@/components/ui/shell";
import { BEUI_FIELD_FILL } from "./profile/beui-form";
import { apiFetch } from "@/lib/client";

type Status = "idle" | "busy" | "sent";

// MOM 2026-10-13 — approved contact details for the Homepage contact panel.
const CHANNELS = [
  { icon: MapPin, label: "Visit us", value: "MIRDC Compound, Gen. Santos Ave. Bicutan 1631, City of Taguig, Metro Manila 1631, Philippines" },
  { icon: Phone, label: "Call us", value: "8837-0431 loc. 440/441" },
  { icon: Mail, label: "Email us", value: "recruitment@mirdc.dost.gov.ph" },
];

export default function ContactView() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");

  // Task 32 — official SignUpForm timing: rules are computed on EVERY render
  // (an error clears the moment its field is fixed); `shown` reveals a
  // field's rule only once it has been left (onBlur) or the form submitted.
  const rules = {
    name: !name.trim() ? "Enter your full name." : undefined,
    email: !email.trim()
      ? "Enter your email address."
      : !isEmailShape(email.trim())
        ? "Enter a valid email address."
        : undefined,
    subject: !subject.trim() ? "Enter a subject." : undefined,
    message: !message.trim() ? "Enter your message." : undefined,
  };
  const { shown, touch, touchAll, reset } = useAuthErrors(rules);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    touchAll();
    if (Object.values(rules).some(Boolean)) return;
    setStatus("busy");
    try {
      const res = await apiFetch<{ submitted: boolean; message: string }>("/api/contact", {
        method: "POST",
        body: { name: name.trim(), email: email.trim(), subject: subject.trim(), message: message.trim() },
      });
      if (res.submitted) {
        setStatus("sent");
        toast.success("Inquiry sent", { description: res.message });
      } else {
        setStatus("idle");
        toast.error(res.message || "Could not send your inquiry");
      }
    } catch (err) {
      setStatus("idle");
      toast.error(err instanceof Error ? err.message : "Could not send your inquiry");
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-14 pt-8 sm:px-6 lg:px-8">
      {/* Enterprise page header (PageHeader) — shared anatomy across ALL pages */}
      <PageHeader
        className="max-w-2xl"
        eyebrow="Get in touch"
        title="Contact the Recruitment Team"
        description="Questions about a posting, your application, or your account? Send us an inquiry and the MIRDC Human Resources team will respond through email."
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Form — the official SignUpForm block's card anatomy: rounded-3xl
            bordered white card, single-column gap-5 flow of icon-led capsule
            fields with reserved error lines (exact sign-in/sign-up look). */}
        <div className="rounded-3xl border border-border bg-cloud/60 p-6">
          {status === "sent" ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <IconChip icon={LifeBuoy} tone="blue" size={48} iconSize={24} />
              <h2 className="text-2xl font-medium leading-[1.1] text-ink">Inquiry received</h2>
              <p className="max-w-sm text-sm leading-relaxed text-body-gray">
                Thank you, your request is now in the HR queue. Keep an eye on your inbox for the
                response.
              </p>
              <button
                type="button"
                onClick={() => {
                  setStatus("idle");
                  setName("");
                  setEmail("");
                  setSubject("");
                  setMessage("");
                  reset();
                }}
                className="dlg-ghost mt-2 min-h-[44px] px-6 text-sm"
              >
                Send another inquiry
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="flex w-full flex-col gap-5" noValidate>
              <Input
                id="contact-name"
                label="Full name"
                autoComplete="name"
                value={name}
                onChange={setName}
                onBlur={() => touch("name")}
                placeholder="Your full name"
                leftIcon={<User />}
                maxLength={120}
                error={shown("name")}
                reserveErrorLine
                classNames={{ field: BEUI_FIELD_FILL }}
              />
              <Input
                id="contact-email"
                label="Email address"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={setEmail}
                onBlur={() => touch("email")}
                placeholder="you@example.gov.ph"
                leftIcon={<Mail />}
                maxLength={200}
                error={shown("email")}
                reserveErrorLine
                classNames={{ field: BEUI_FIELD_FILL }}
              />
              <Input
                id="contact-subject"
                label="Subject"
                value={subject}
                onChange={setSubject}
                onBlur={() => touch("subject")}
                placeholder="e.g. Clarification on Science Research Specialist II posting"
                leftIcon={<Tag />}
                maxLength={200}
                error={shown("subject")}
                reserveErrorLine
                classNames={{ field: BEUI_FIELD_FILL }}
              />
              <Textarea
                id="contact-message"
                label="Message"
                value={message}
                onChange={setMessage}
                onBlur={() => touch("message")}
                placeholder="How can we help?"
                maxLength={4000}
                error={shown("message")}
                reserveErrorLine
                classNames={{ field: BEUI_FIELD_FILL, textarea: "min-h-[140px]" }}
              >
                <p className="px-1 text-xs text-stone">Up to 4,000 characters.</p>
              </Textarea>
              <StatefulButton
                type="submit"
                size="lg"
                state={status === "busy" ? "loading" : "idle"}
                loadingText="Sending"
                className="w-full"
              >
                Send inquiry
              </StatefulButton>
            </form>
          )}
        </div>

        {/* Channels */}
        <aside className="space-y-3">
          {CHANNELS.map((c) => (
            <div key={c.label} className="dlg-card flex items-start gap-3.5 p-4">
              <IconChip icon={c.icon} tone="blue" size={40} iconSize={20} />
              <div className="min-w-0">
                <p className="eyebrow">{c.label}</p>
                <p className="mt-1 text-sm leading-relaxed text-stone">{c.value}</p>
              </div>
            </div>
          ))}
          <p className="px-1 text-xs leading-relaxed text-stone">
            Responses are typically sent within 2–3 working days. For account access issues, use the
            “Forgot password?” option on the sign-in page.
          </p>
        </aside>
      </div>
    </div>
  );
}
