"use client";

// ============================================================================
// RMIS — Admin settings (spec §7.14, `#/settings?tab=users|audit|sms|email`).
// Sub-nav: Users & Roles / Audit Log / SMS Gateway / Email Notices. Deep
// linkable; the dashboard links to ?tab=audit.
// Task 32 — the user dialogs carry the sign-in/sign-up look: bordered dialog
// cards, auth header typography, icon-led fields with reserved error lines,
// and the auth-exact error timing via useAuthErrors — rules derived on every
// render, revealed once a field was left (onBlur) or the form submitted,
// clearing the moment it is fixed. Official StatefulButton submit.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";
import { Inbox, Lock, Mail, Pencil, ScrollText, Search, Send, ShieldCheck, Trash2, User, UsersRound } from "lucide-react";
import { useSession } from "@/components/session-provider";
// BEUI Phase 8 — official Input (beui.dev/r/input, vendored at
// src/components/motion/input): label prop renders the field's own label,
// onChange receives the string, error drives the animated message line.
import { Input } from "@/components/motion/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/motion/select";
import { EmptyState, FilterChip, IconChip, Monogram, nameInitials, NoteBanner, PageHeader, Pagination, SkeletonRows, StatTile, StatusPill, dialogScroll } from "@/components/ui/shell";
import { isEmailShape, useAuthErrors } from "@/components/forms/field-errors";
import { StatefulButton } from "@/components/motion/button";
import { AuditFeedRow } from "@/components/ui/audit-row";
import { apiFetch, formatDateTime, humanize, timeAgo } from "@/lib/client";
import { useHashRoute, navigate } from "@/lib/router";
import { useIsMobile } from "@/hooks/use-mobile";
import { pillClass } from "@/lib/status-ui";
// BEUI Phase 5 — official virtualized Table (beui.dev/r/table, vendored
// verbatim at src/components/motion/table). Alignment only via sanctioned props.
import { Table } from "@/components/motion/table";
import { cn } from "@/lib/utils";
import { ghostBadModifier } from "@/components/ui/buttons";
import { ghostBtn, ctaBtn, iconBtn, iconBtnBad } from "@/components/views/recruitment";

// QA 2026-02: Settings contents are role-scoped — administrators get the full
// configuration set (Users & Security, Audit Log, SMS Gateway, Email Notices,
// Contact Requests); evaluators get Email Notices (read-only) + Contact
// Requests, per the approved module map.
const ALL_TABS = [
  { key: "users", label: "Users & Security", icon: UsersRound, roles: ["ADMIN"] },
  { key: "audit", label: "Audit Log", icon: ShieldCheck, roles: ["ADMIN"] },
  { key: "sms", label: "SMS Gateway", icon: Send, roles: ["ADMIN"] },
  { key: "email", label: "Email Notices", icon: Mail, roles: ["ADMIN", "EVALUATOR"] },
  { key: "contact", label: "Contact Requests", icon: Inbox, roles: ["ADMIN", "EVALUATOR"] },
] as const;

type TabKey = (typeof ALL_TABS)[number]["key"];

// Official field-label grammar (the classes the official Input renders for
// its own label) — the Role select's hand-drawn label uses the same token.
function labelCls() {
  return "mb-1.5 block px-1 text-sm font-medium text-foreground";
}

// Monogram initials, filter chips, pagination and the audit-feed rows are the
// shared primitives (ui/shell + ui/audit-row) — no local copies.

// ───────────────────────────────────────────────────────────── Users panel

type UserRow = {
  id: string;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: "ADMIN" | "EVALUATOR" | "APPLICANT";
  blocked: boolean;
  createdAt: string;
  applicant?: { id: number; isProfileComplete: boolean } | null;
};

function UsersPanel() {
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 15;
  const [busyId, setBusyId] = useState<string | null>(null);
  // Task 39 — responsive columns for the official BEUI Table (see below).
  const isMobile = useIsMobile();

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [hardTarget, setHardTarget] = useState<UserRow | null>(null);
  const [disableTarget, setDisableTarget] = useState<UserRow | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRows(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (q.trim()) params.set("q", q.trim());
      if (role !== "ALL") params.set("role", role);
      const data = await apiFetch<{ data: UserRow[]; total: number }>(`/api/admin/users?${params.toString()}`);
      setRows(data.data);
      setTotal(data.total);
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : "Failed to load users");
      setRows([]);
    }
  }, [q, role, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const toggleActive = async (u: UserRow) => {
    setBusyId(u.id);
    try {
      if (!u.blocked) {
        setDisableTarget(u); // confirm first
      } else {
        await apiFetch(`/api/admin/users/${u.id}`, { method: "PATCH", body: { isActive: true } });
        toast.success(`${u.username} re-enabled`);
        await load(true);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const confirmDisable = async () => {
    if (!disableTarget) return;
    try {
      await apiFetch(`/api/admin/users/${disableTarget.id}`, { method: "DELETE" });
      toast.success(`${disableTarget.username} disabled`);
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
    setDisableTarget(null);
  };

  const confirmHardDelete = async () => {
    if (!hardTarget) return;
    try {
      await apiFetch(`/api/admin/users/${hardTarget.id}?hard=1`, { method: "DELETE" });
      toast.success(`${hardTarget.username} permanently deleted`);
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
    setHardTarget(null);
  };

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="dlg-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
        <Input
          leftIcon={<Search className="h-4 w-4" aria-hidden />}
          value={q}
          onChange={(next) => { setQ(next); setPage(1); }}
          placeholder="Search name, email or username…"
          className="flex-1"
        />
        <Select className="w-full sm:w-44" value={role} onValueChange={(v) => { setRole(v); setPage(1); }}>
          <SelectTrigger className="min-h-[44px]"><span className="sr-only">Role filter</span><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All roles</SelectItem>
            <SelectItem value="APPLICANT">Applicant</SelectItem>
            <SelectItem value="EVALUATOR">Evaluator</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Canonical table anatomy (same as recruitment/candidates/review-queue):
          the collection lives in a .dlg-card.table-card with an in-card band
          (icon chip · title · count · action) — previously the bare bordered
          Table sat directly on the canvas, the one uncontained table in the
          staff surface family. */}
      <div className="dlg-card table-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <IconChip icon={UsersRound} tone="slate" size={36} iconSize={16} />
          <h2 className="text-base font-medium text-ink">Users &amp; Security</h2>
          <span className="dlg-pill num ml-auto bg-fog px-2.5 py-1 text-xs font-medium text-stone">
            {total} account{total === 1 ? "" : "s"}
          </span>
          <button type="button" className={ctaBtn} onClick={() => setCreateOpen(true)}>Create User</button>
        </div>
      {/* BEUI Phase 5 — official virtualized Table (beui.dev/r/table); the
          block's own loading skeleton + emptyState carry the fetch states.
          384px viewport = the old max-h-96 scroll cap, sticky header included.
          Task 39 (per user, mobile): below md the fixed 480px User column
          crushes the rest — phones get a 2-column set that fits: User
          (flexible, the ROLE folded into the subtitle) and a combined action
          cell carrying the Active switch + Edit + Delete. sm+ unchanged. */}
      <Table
        data={rows ?? []}
        loading={rows === null}
        emptyState={<EmptyState icon={UsersRound} tone="slate" title="No accounts match your filters" compact />}
        getRowId={(u) => String(u.id)}
        rowHeight={64}
        height={384}
        className={cn(
              "rounded-none border-0 [&_table]:w-full",
              // Task 39 (mobile): the block's td/th wear px-4; below sm that
              // steals 8px per cell from the tight 3-column budget — px-3
              // keeps the declared widths ellipsis-free on phones.
              "max-sm:[&_td]:px-3 max-sm:[&_th]:px-3"
            )}
        columns={isMobile ? [
          {
            key: "user",
            header: "User",
            // Declared: see the recruitment note — the block's filler col
            // would otherwise take half the leftover under table-layout:fixed.
            width: "208px",
            cell: (u) => (
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="contents">
                  <Monogram size={32} className="rounded-full">{nameInitials([u.firstName, u.lastName].filter(Boolean).join(" ") || u.username)}</Monogram>
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{[u.firstName, u.lastName].filter(Boolean).join(" ") || u.username}</p>
                  <p className="num truncate text-xs text-pebble">{u.role} · @{u.username}</p>
                </div>
              </div>
            ),
          },
          {
            key: "actions",
            header: "",
            width: "150px",
            align: "right",
            cell: (u) => (
              <div className="flex items-center justify-end gap-1">
                <Switch checked={!u.blocked} disabled={busyId === u.id} onCheckedChange={() => void toggleActive(u)} aria-label={`Toggle ${u.username}`} />
                <button
                  type="button"
                  className={iconBtn}
                  aria-label={`Edit ${u.username}`}
                  title="Edit"
                  onClick={() => setEditUser(u)}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  className={iconBtnBad}
                  aria-label={`Delete ${u.username}`}
                  title="Delete"
                  onClick={() => setHardTarget(u)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ),
          },
        ] : [
          {
            key: "user",
            header: "User",
            width: "480px",
            cell: (u) => (
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="contents">
                  <Monogram size={32} className="rounded-full">{nameInitials([u.firstName, u.lastName].filter(Boolean).join(" ") || u.username)}</Monogram>
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{[u.firstName, u.lastName].filter(Boolean).join(" ") || u.username}</p>
                  <p className="num text-xs text-pebble">{u.email} · @{u.username}</p>
                </div>
              </div>
            ),
          },
          {
            key: "role",
            header: "Role",
            width: "140px",
            cell: (u) => <span className={pillClass("neutral")}>{u.role}</span>,
          },
          {
            key: "active",
            header: "Active",
            width: "110px",
            cell: (u) => (
              <Switch checked={!u.blocked} disabled={busyId === u.id} onCheckedChange={() => void toggleActive(u)} aria-label={`Toggle ${u.username}`} />
            ),
          },
          {
            key: "actions",
            header: "",
            width: "120px",
            align: "right",
            cell: (u) => (
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  className={iconBtn}
                  aria-label={`Edit ${u.username}`}
                  title="Edit"
                  onClick={() => setEditUser(u)}
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  className={iconBtnBad}
                  aria-label={`Delete ${u.username}`}
                  title="Delete"
                  onClick={() => setHardTarget(u)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ),
          },
        ]}
      />
      </div>

      {pages > 1 && (
        <Pagination page={page} pageCount={pages} total={total} onPage={setPage} unit="accounts" />
      )}

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={() => void load(true)} />
      {editUser && (
        <EditUserDialog user={editUser} onOpenChange={(o) => !o && setEditUser(null)} onSaved={() => void load(true)} />
      )}

      <AlertDialog open={!!disableTarget} onOpenChange={(o) => !o && setDisableTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable {disableTarget?.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              The account will be signed out and cannot sign in until re-enabled. Nothing is permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDisable()}>Disable</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!hardTarget} onOpenChange={(o) => !o && setHardTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete {hardTarget?.username}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the account and its applicant profile. Administrators and your own account are protected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={cn(ghostBadModifier, "min-h-[44px] px-4 text-sm font-medium")}
              onClick={() => void confirmHardDelete()}
            >
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CreateUserDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: () => void }) {
  const [form, setForm] = useState({ email: "", username: "", password: "", role: "APPLICANT", firstName: "", lastName: "" });
  const [busy, setBusy] = useState(false);
  // Task 32 — auth-exact error timing (useAuthErrors): rules are derived on
  // EVERY render (an error clears the moment its field is fixed); `shown`
  // reveals a rule only once its field was left (onBlur) or the form was
  // submitted. Same messages the submit computed in Task 31.
  const rules = {
    email: !form.email.trim()
      ? "Email is required."
      : !isEmailShape(form.email.trim())
        ? "Enter a valid email address."
        : undefined,
    username: !form.username.trim()
      ? "Username is required."
      : form.username.length < 3
        ? "Username must be at least 3 characters."
        : undefined,
    password: !form.password
      ? "Password is required."
      : form.password.length < 6
        ? "Password must be at least 6 characters."
        : undefined,
  };
  const { shown, touch, touchAll, reset } = useAuthErrors(rules);

  const submit = async () => {
    touchAll();
    if (Object.values(rules).some(Boolean)) return;
    setBusy(true);
    try {
      await apiFetch("/api/admin/users", { method: "POST", body: form });
      toast.success("Account created");
      onOpenChange(false);
      setForm({ email: "", username: "", password: "", role: "APPLICANT", firstName: "", lastName: "" });
      reset();
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      {/* Task 32 — the dialog carries the official SignUpForm card anatomy:
          hairline-bordered white card + auth header typography. */}
      <DialogContent className={`${dialogScroll} rounded-3xl border border-border bg-white sm:max-w-md`} ariaLabel="Create User">
        <DialogHeader className="text-left">
          <DialogTitle className="text-xl font-medium text-foreground">Create User</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">Staff accounts can only sign in from the MIRDC intranet.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <Input
            label="Email *"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={form.email}
            onChange={(next) => setForm({ ...form, email: next })}
            onBlur={() => touch("email")}
            placeholder="name@mirdc.gov.ph"
            leftIcon={<Mail />}
            error={shown("email")}
            reserveErrorLine
          />
          <Input
            label="Username *"
            autoComplete="username"
            value={form.username}
            onChange={(next) => setForm({ ...form, username: next })}
            onBlur={() => touch("username")}
            leftIcon={<User />}
            error={shown("username")}
            reserveErrorLine
          />
          <Input
            type="password"
            label="Password *"
            autoComplete="new-password"
            value={form.password}
            onChange={(next) => setForm({ ...form, password: next })}
            onBlur={() => touch("password")}
            leftIcon={<Lock />}
            error={shown("password")}
            reserveErrorLine
          />
          <div>
            <Label className={labelCls()}>Role</Label>
            <Select className="w-full" value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
              <SelectTrigger className="min-h-[44px]"><span className="sr-only">Role</span><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="APPLICANT">Applicant</SelectItem>
                <SelectItem value="EVALUATOR">Evaluator</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="First name" value={form.firstName} onChange={(next) => setForm({ ...form, firstName: next })} reserveErrorLine />
            <Input label="Last name" value={form.lastName} onChange={(next) => setForm({ ...form, lastName: next })} reserveErrorLine />
          </div>
        </div>
        <DialogFooter className="flex-col gap-3 sm:flex-row">
          <button type="button" className={ghostBtn} onClick={() => onOpenChange(false)}>Cancel</button>
          {/* Task 32 — official StatefulButton lifecycle; never disabled for
              validation gaps (busy/loading only). */}
          <StatefulButton
            type="button"
            size="md"
            state={busy ? "loading" : "idle"}
            loadingText="Creating"
            className="min-h-[44px] px-5 py-2.5"
            onClick={() => void submit()}
          >
            Create
          </StatefulButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ user, onOpenChange, onSaved }: { user: UserRow; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [form, setForm] = useState({ firstName: user.firstName ?? "", lastName: user.lastName ?? "", role: user.role, password: "" });
  const [busy, setBusy] = useState(false);
  // Task 32 — auth-exact error timing (useAuthErrors) on the optional
  // reset-password rule (≥6 chars when provided): the rule is derived on
  // every render, revealed once the field was left (onBlur) or the form was
  // submitted, and clears the moment it is fixed.
  const rules = {
    password: form.password && form.password.length < 6 ? "Password must be at least 6 characters." : undefined,
  };
  const { shown, touch, touchAll, reset } = useAuthErrors(rules);

  const submit = async () => {
    touchAll();
    if (Object.values(rules).some(Boolean)) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { firstName: form.firstName, lastName: form.lastName, role: form.role };
      if (form.password) body.password = form.password;
      await apiFetch(`/api/admin/users/${user.id}`, { method: "PATCH", body });
      toast.success("Account updated");
      onOpenChange(false);
      reset();
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      {/* Task 32 — the dialog carries the official SignUpForm card anatomy:
          hairline-bordered white card + auth header typography. */}
      <DialogContent className={`${dialogScroll} rounded-3xl border border-border bg-white sm:max-w-md`} ariaLabel={`Edit @${user.username}`}>
        <DialogHeader className="text-left">
          <DialogTitle className="text-xl font-medium text-foreground">Edit @{user.username}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">{user.email}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="First name" value={form.firstName} onChange={(next) => setForm({ ...form, firstName: next })} reserveErrorLine />
            <Input label="Last name" value={form.lastName} onChange={(next) => setForm({ ...form, lastName: next })} reserveErrorLine />
          </div>
          <div>
            <Label className={labelCls()}>Role</Label>
            <Select className="w-full" value={form.role} onValueChange={(v) => setForm({ ...form, role: v as UserRow["role"] })}>
              <SelectTrigger className="min-h-[44px]"><span className="sr-only">Role</span><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="APPLICANT">Applicant</SelectItem>
                <SelectItem value="EVALUATOR">Evaluator</SelectItem>
                <SelectItem value="ADMIN">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input
            type="password"
            label="Reset password"
            autoComplete="new-password"
            value={form.password}
            onChange={(next) => setForm({ ...form, password: next })}
            onBlur={() => touch("password")}
            placeholder="Leave blank to keep current"
            leftIcon={<Lock />}
            error={shown("password")}
            reserveErrorLine
          />
        </div>
        <DialogFooter className="flex-col gap-3 sm:flex-row">
          <button type="button" className={ghostBtn} onClick={() => onOpenChange(false)}>Cancel</button>
          {/* Task 32 — official StatefulButton lifecycle; never disabled for
              validation gaps (busy/loading only). */}
          <StatefulButton
            type="button"
            size="md"
            state={busy ? "loading" : "idle"}
            loadingText="Saving"
            className="min-h-[44px] px-5 py-2.5"
            onClick={() => void submit()}
          >
            Save changes
          </StatefulButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────────────────────────────────────────────────────── Audit panel

type AuditRow = {
  id: number;
  timestamp: string;
  userLabel: string | null;
  userRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  description: string | null;
  ipAddress: string | null;
};

function AuditPanel() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [summary, setSummary] = useState<{ totalEvents: number; byRole: Record<string, number> } | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const load = useCallback(async (silent = false) => {
    if (!silent) setRows(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (q.trim()) params.set("search", q.trim());
      if (action !== "ALL") params.set("action", action);
      const data = await apiFetch<{
        data: AuditRow[];
        total: number;
        actions: string[];
        summary: { totalEvents: number; onPage: number; topActions: { action: string; count: number }[]; byRole: Record<string, number> };
      }>(`/api/admin/audit-logs?${params.toString()}`);
      setRows(data.data);
      setSummary({ totalEvents: data.summary.totalEvents, byRole: data.summary.byRole });
      setActions(data.actions);
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : "Failed to load audit log");
      setRows([]);
    }
  }, [q, action, page]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const pages = Math.max(1, Math.ceil((rows === null ? 0 : summary?.totalEvents ?? 0) / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <IconChip icon={ScrollText} tone="plum" size={36} iconSize={16} />
        <h2 className="text-base font-medium text-ink">Audit Log</h2>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {(
          [
            ["Total events", summary?.totalEvents],
            ...(["ADMIN", "EVALUATOR", "APPLICANT"] as const).map((r) => [humanize(r), summary?.byRole?.[r] ?? 0] as const),
          ] as [string, number | undefined][]
        ).map(([label, value]) => (
          <StatTile key={label} label={label} value={value ?? "-"} />
        ))}
      </div>

      <div className="dlg-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
        <Input
          leftIcon={<Search className="h-4 w-4" aria-hidden />}
          value={q}
          onChange={(next) => { setQ(next); setPage(1); }}
          placeholder="Search descriptions and actors…"
          className="flex-1"
        />
        <Select className="w-full sm:w-56" value={action} onValueChange={(v) => { setAction(v); setPage(1); }}>
          <SelectTrigger className="min-h-[44px]"><span className="sr-only">Action filter</span><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All actions</SelectItem>
            {actions.map((a) => <SelectItem key={a} value={a}>{humanize(a)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="dlg-card-plain overflow-hidden">
        <div className="max-h-96 overflow-y-auto scroll-thin p-2">
          {rows === null && <div className="p-2"><SkeletonRows rows={6} rowClassName="h-11" /></div>}
          {rows?.length === 0 && <EmptyState icon={ScrollText} tone="plum" title="No audit events match" compact />}
          {rows?.map((r) => (
            <AuditFeedRow
              key={r.id}
              variant="ledger"
              timestamp={r.timestamp}
              userLabel={r.userLabel}
              userRole={r.userRole}
              action={r.action}
              description={r.description}
            />
          ))}
        </div>
      </div>

      {pages > 1 && (
        <Pagination page={page} pageCount={pages} total={summary?.totalEvents ?? 0} onPage={setPage} unit="events" />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────── Messaging panels (SMS/email)

type MsgLog = {
  id: number;
  to: string;
  subject?: string;
  message?: string;
  provider: string;
  status: string;
  error: string | null;
  createdAt: string;
  attachments?: string | null;
};

type MsgPanelData = {
  provider: string;
  configured: boolean;
  stats: { total: number; sent: number; failed: number; skipped?: number; mock?: number; last24h: number };
};

// BEUI Phase 7 — async table (beui.dev/r/table-async): ledger page size used
// for both the first load and every onEndReached cursor page.
const LOG_PAGE = 25;

/** Delivery status → functional status tone pill. */
function StatusChip({ status }: { status: string }) {
  const variant =
    status === "sent" ? "ok"
    : status === "failed" ? "bad"
    : status === "mock" ? "warn"
    : "neutral";
  return <StatusPill status={status} variant={variant} />;
}

function MessagingPanel({ kind, readOnly = false }: { kind: "sms" | "email"; readOnly?: boolean }) {
  const [data, setData] = useState<MsgPanelData | null>(null);
  // BEUI Phase 7 — async contract (beui.dev/r/table-async): the ledger loads
  // its first page here, then the official Table's onEndReached cursor-pages
  // older rows; loading/skeletonRows carry the fetch states in-block.
  const [logs, setLogs] = useState<MsgLog[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorRef = useRef<number | null>(null);
  const busyRef = useRef(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setData(null);
      setLogs([]);
      setCursor(null);
      cursorRef.current = null;
    }
    try {
      const res = await apiFetch<MsgPanelData & { logs: MsgLog[]; nextCursor: number | null }>(`/api/admin/${kind}`);
      setData({ provider: res.provider, configured: res.configured, stats: res.stats });
      setLogs(res.logs);
      setCursor(res.nextCursor);
      cursorRef.current = res.nextCursor;
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : "Failed to load");
      setData({ provider: "mock", configured: false, stats: { total: 0, sent: 0, failed: 0, last24h: 0 } });
      setLogs([]);
      setCursor(null);
      cursorRef.current = null;
    }
  }, [kind]);

  useEffect(() => { void load(); }, [load]);

  const loadMore = useCallback(async () => {
    if (busyRef.current || cursorRef.current == null) return;
    busyRef.current = true;
    setLoadingMore(true);
    try {
      const res = await apiFetch<{ logs: MsgLog[]; nextCursor: number | null }>(
        `/api/admin/${kind}?before=${cursorRef.current}&limit=${LOG_PAGE}`,
      );
      setLogs((prev) => [...prev, ...res.logs]);
      setCursor(res.nextCursor);
      cursorRef.current = res.nextCursor;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load more");
    } finally {
      busyRef.current = false;
      setLoadingMore(false);
    }
  }, [kind]);

  const testSend = async () => {
    setBusy(true);
    try {
      const body = kind === "sms" ? { to, message: message || undefined } : { to, subject: subject || undefined, message: message || undefined };
      const res = await apiFetch<{ email?: { status: string }; sms?: { status: string } }>(`/api/admin/${kind}`, { method: "POST", body });
      const status = res.email?.status ?? res.sms?.status ?? "sent";
      if (status === "sent") toast.success(`Test ${kind} sent`);
      else if (status === "mock") toast.info(`Test ${kind} logged in mock mode`, { description: "Configure a provider to deliver for real." });
      else if (status === "skipped") toast.warning("Recipient skipped", { description: "Check the address or mobile number format." });
      else toast.error(`Delivery failed. Check the logs`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
      // Refresh the ledger even after a failed attempt — the row is logged
      // (status "failed") and the admin should see it without leaving the tab.
      await load(true);
    }
  };

  const tiles: [string, number | undefined][] = [
    ["Total", data?.stats.total],
    ["Sent", data?.stats.sent],
    ["Failed", data?.stats.failed],
    ["Last 24h", data?.stats.last24h],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {kind === "sms" ? (
          <IconChip icon={Send} tone="gold" size={36} iconSize={16} />
        ) : (
          <IconChip icon={Mail} tone="emerald" size={36} iconSize={16} />
        )}
        <h2 className="text-base font-medium text-ink">
          {kind === "sms" ? "SMS Gateway" : "Email Notices"}
        </h2>
      </div>
      <div className="dlg-card-plain p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Active provider</p>
            <p className="num mt-1 text-lg font-medium text-ink">{humanize(data?.provider ?? "…")}</p>
            {data?.provider === "mock" ? (
              <p className="mt-1 text-xs text-body-gray">Messages are logged only.</p>
            ) : null}
          </div>
          {data?.provider === "mock" ? (
            <StatusPill status="Mock mode" variant="neutral" />
          ) : (
            <StatusPill status={data?.configured ? "Configured" : "Not configured"} variant={data?.configured ? "ok" : "warn"} />
          )}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {tiles.map(([label, value]) => (
            <StatTile key={label} label={label} value={value ?? "-"} />
          ))}
        </div>
      </div>

      {readOnly ? (
        <NoteBanner label="Read-only view">
          notification sending and gateway configuration are managed by system administrators.
        </NoteBanner>
      ) : (
      <div className="dlg-card-plain p-5 sm:p-6">
        <p className="mb-4 text-base font-medium text-ink">Test send</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label={kind === "sms" ? "Mobile number (09…)" : "Recipient email"}
            value={to}
            onChange={(next) => setTo(next)}
            placeholder={kind === "sms" ? "09171234567" : "name@example.com"}
          />
          {kind === "email" && (
            <Input
              label="Subject"
              value={subject}
              onChange={(next) => setSubject(next)}
              placeholder="RMIS test email"
            />
          )}
          <div className={kind === "email" ? "sm:col-span-2" : ""}>
            <Input label="Message" value={message} onChange={(next) => setMessage(next)} placeholder="Optional message" />
          </div>
        </div>
        <button type="button" className={`${ctaBtn} mt-4`} disabled={busy || !to.trim()} onClick={() => void testSend()}>
          {busy ? "Sending…" : `Send test ${kind}`}
        </button>
      </div>
      )}

      {/* Canonical table anatomy (same as recruitment/candidates/review-queue):
          the delivery log lives in a .dlg-card.table-card with an in-card band
          (icon chip · title · async status line as the count) — previously the
          bare bordered Table and its status line sat directly on the canvas. */}
      <div className="dlg-card table-card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          {kind === "sms" ? (
            <IconChip icon={Send} tone="gold" size={36} iconSize={16} />
          ) : (
            <IconChip icon={Mail} tone="emerald" size={36} iconSize={16} />
          )}
          <h2 className="text-base font-medium text-ink">Delivery log</h2>
          <p className="ml-auto text-xs text-body-gray">
            <span className="num">{logs.length.toLocaleString()} loaded</span>
            <span className="ml-3">
              {loadingMore
                ? "Loading…"
                : data === null
                  ? "…"
                  : cursor === null
                    ? "All loaded"
                    : "Scroll for more"}
            </span>
          </p>
        </div>
      {/* BEUI Phase 7 — async contract (beui.dev/r/table-async): first page
          + onEndReached cursor paging; the block appends its own skeletonRows
          while the next page is in flight and pauses end-reached. */}
      <Table
        data={logs}
        loading={data === null || loadingMore}
        onEndReached={() => void loadMore()}
        emptyState={
          <EmptyState
            icon={kind === "sms" ? Send : Mail}
            tone={kind === "sms" ? "gold" : "emerald"}
            title="Nothing sent yet"
            description="Send a test message to see its delivery log here."
            compact
          />
        }
        getRowId={(l) => String(l.id)}
        rowHeight={64}
        height={384}
        className="rounded-none border-0 [&_table]:w-full"
        columns={[
          {
            key: "to",
            header: "To",
            width: "220px",
            cell: (l) => <span className="font-medium text-ink">{l.to}</span>,
          },
          {
            key: "subject",
            header: kind === "sms" ? "Message" : "Subject",
            width: "330px",
            cell: (l) => <span className="text-body-gray">{l.subject ?? l.message ?? "-"}</span>,
          },
          {
            key: "status",
            header: "Status",
            width: "160px",
            cell: (l) => (
              <div className="min-w-0">
                <StatusChip status={l.status} />
                {l.error && <p className="mt-1 truncate text-xs text-body-gray">{l.error}</p>}
              </div>
            ),
          },
          {
            key: "when",
            header: "When",
            width: "120px",
            align: "right",
            cell: (l) => (
              <span className="num text-xs text-body-gray" title={formatDateTime(l.createdAt)}>
                {timeAgo(l.createdAt)}
              </span>
            ),
          },
        ]}
      />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────── Contact Requests panel (QA)

type ContactRow = {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: "OPEN" | "RESOLVED";
  createdAt: string;
  resolvedAt: string | null;
  handledBy?: { firstName: string | null; lastName: string | null; username: string } | null;
};

function ContactPanel() {
  const [rows, setRows] = useState<ContactRow[] | null>(null);
  const [filter, setFilter] = useState<"ALL" | "OPEN" | "RESOLVED">("ALL");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setRows(null);
    try {
      const q = filter === "ALL" ? "" : `?status=${filter}`;
      const res = await apiFetch<{ data: ContactRow[] }>(`/api/admin/contact-requests${q}`);
      setRows(res.data);
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : "Failed to load contact requests");
      setRows([]);
    }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const setStatus = async (id: number, status: "OPEN" | "RESOLVED") => {
    setBusyId(id);
    try {
      await apiFetch("/api/admin/contact-requests", { method: "PATCH", body: { id, status } });
      toast.success(status === "RESOLVED" ? "Marked as resolved" : "Reopened");
      await load(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-medium text-ink">Contact Requests</h2>
        <p className="mt-1 text-sm leading-relaxed text-body-gray">
          Inquiries and requests submitted through the public Contact page. Reply to the sender
          through their email address, then mark the request as resolved.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
        {(["ALL", "OPEN", "RESOLVED"] as const).map((f) => (
          <FilterChip
            key={f}
            active={filter === f}
            onClick={() => setFilter(f)}
          >
            {f === "ALL" ? "All" : f === "OPEN" ? "Open" : "Resolved"}
          </FilterChip>
        ))}
      </div>

      {/* Canonical table anatomy (same as recruitment/candidates/review-queue):
          the request ledger lives in a .dlg-card.table-card with an in-card
          band (icon chip · title · count) — previously the bare bordered
          Table sat directly on the canvas. */}
      <div className="dlg-card table-card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <IconChip icon={Inbox} tone="slate" size={36} iconSize={16} />
          <h2 className="text-base font-medium text-ink">Requests</h2>
          <span className="dlg-pill num ml-auto bg-fog px-2.5 py-1 text-xs font-medium text-stone">
            {rows?.length ?? "…"} in view
          </span>
        </div>
      {/* BEUI Phase 5 — official virtualized Table; block loading/emptyState.
          Message preview clamps to two lines to honor the block's fixed-row
          virtualization contract. */}
      <Table
        data={rows ?? []}
        loading={rows === null}
        emptyState={
          <EmptyState
            icon={Inbox}
            tone="slate"
            title="No contact requests yet"
            description="Messages from the public Contact page will appear here."
            compact
          />
        }
        getRowId={(r) => String(r.id)}
        rowHeight={72}
        height={384}
        className="rounded-none border-0 [&_table]:w-full"
        columns={[
          {
            key: "from",
            header: "From",
            width: "190px",
            cell: (r) => (
              <div className="min-w-0">
                <p className="font-medium text-ink">{r.name}</p>
                <p className="truncate text-xs text-body-gray">{r.email}</p>
              </div>
            ),
          },
          {
            key: "subject",
            header: "Subject",
            width: "270px",
            cell: (r) => (
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{r.subject}</p>
                <p className="line-clamp-2 whitespace-pre-line text-xs leading-relaxed text-body-gray">{r.message}</p>
              </div>
            ),
          },
          {
            key: "status",
            header: "Status",
            width: "160px",
            cell: (r) => (
              <div className="min-w-0">
                <StatusPill status={r.status === "RESOLVED" ? "Resolved" : "Open"} variant={r.status === "RESOLVED" ? "ok" : "warn"} />
                {r.handledBy && (
                  <p className="mt-1 truncate text-xs text-stone">
                    by {[r.handledBy.firstName, r.handledBy.lastName].filter(Boolean).join(" ") || r.handledBy.username}
                  </p>
                )}
              </div>
            ),
          },
          {
            key: "received",
            header: "Received",
            width: "120px",
            align: "right",
            cell: (r) => (
              <span className="num text-xs text-body-gray" title={formatDateTime(r.createdAt)}>
                {timeAgo(r.createdAt)}
              </span>
            ),
          },
          {
            key: "action",
            header: "Action",
            width: "110px",
            align: "right",
            cell: (r) => (
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => void setStatus(r.id, r.status === "RESOLVED" ? "OPEN" : "RESOLVED")}
                className={r.status === "RESOLVED" ? `${ghostBtn} min-h-[36px] px-3 text-xs` : `${ctaBtn} min-h-[36px] px-3 text-xs`}
              >
                {busyId === r.id ? "…" : r.status === "RESOLVED" ? "Reopen" : "Resolve"}
              </button>
            ),
          },
        ]}
      />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────── Root view

export default function Settings() {
  const { user } = useSession();
  const role = user?.role ?? "ADMIN";
  const tabs = ALL_TABS.filter((t) => (t.roles as readonly string[]).includes(role));
  const route = useHashRoute();
  const tabParam = route.params.tab;
  const defaultTab: TabKey = role === "ADMIN" ? "users" : "email";
  const tab: TabKey = tabs.some((t) => t.key === tabParam) ? (tabParam as TabKey) : defaultTab;

  return (
    <div className="space-y-6">
      {/* Enterprise page header (PageHeader) — shared anatomy across all views */}
      <PageHeader
        title="Settings"
        description="Manage accounts, review the audit trail, and configure notification channels."
      />

      <div className="grid gap-6 lg:grid-cols-[240px_1fr] lg:items-start">
        {/* Left vertical tab rail (white card); horizontal scroll pills on mobile.
            min-w-0: the nowrap tab buttons' min-content must not widen the auto
            track on phones (observed OV 231-286 at 320/375). */}
        {/* dlg-card-plain (not dlg-card): .dlg-card sets position:relative in
            unlayered CSS, which would override lg:sticky from the utilities
            layer and silently kill the desktop pin. */}
        <nav className="dlg-card-plain min-w-0 p-2 lg:sticky lg:top-6" aria-label="Settings sections">
          <div className="flex gap-1 overflow-x-auto scroll-thin lg:flex-col lg:overflow-visible">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => navigate("settings", { tab: t.key })}
                aria-current={tab === t.key ? "page" : undefined}
                className={`focus-ring inline-flex h-11 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-4 text-sm transition-colors ${
                  tab === t.key ? "bg-cloud text-ink" : "text-stone hover:bg-fog hover:text-ink"
                }`}
              >
                <t.icon className="h-4 w-4 shrink-0" aria-hidden />
                {t.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="min-w-0">
          {tab === "users" && <UsersPanel />}
          {tab === "audit" && <AuditPanel />}
          {tab === "sms" && <MessagingPanel kind="sms" />}
          {tab === "email" && <MessagingPanel kind="email" readOnly={role !== "ADMIN"} />}
          {tab === "contact" && <ContactPanel />}
        </div>
      </div>
    </div>
  );
}
