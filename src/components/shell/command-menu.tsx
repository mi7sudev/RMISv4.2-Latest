"use client";

// ============================================================================
// RMIS — Global command palette (spec §13, ⌘K/Ctrl+K): Navigation (role's
// items), Positions (staff: first 50 jobs), Applicants (staff: first 50
// registry entries), Quick actions (sign out). Data fetched on open.
// ============================================================================

import { useEffect, useState } from "react";
import { Briefcase, LogOut, UserRound } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { NAV_CONFIG, performSignOut } from "@/components/shell/nav-rail";
import { useSession } from "@/components/session-provider";
import { apiFetch, fullName } from "@/lib/client";
import { navigate } from "@/lib/router";
import type { JobWire } from "@/lib/router";

type CandidateRow = {
  id: number;
  firstName: string | null;
  lastName: string | null;
  emailAddress: string | null;
  isProfileComplete: boolean;
  hasAccount: boolean;
  applicationCount: number;
};

export default function CommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { user } = useSession();
  const [jobs, setJobs] = useState<JobWire[]>([]);
  const [applicants, setApplicants] = useState<CandidateRow[]>([]);

  const staff = user?.role === "ADMIN" || user?.role === "EVALUATOR";

  // Fetch palette data each time the palette opens (spec §13).
  useEffect(() => {
    if (!open || !user || !staff) return;
    let alive = true;
    void apiFetch<unknown>("/api/jobs?limit=50")
      .then((data) => {
        if (alive) setJobs(Array.isArray(data) ? (data as JobWire[]) : []);
      })
      .catch(() => {
        /* palette stays usable without data */
      });
    void apiFetch<{ data?: CandidateRow[] }>("/api/admin/applicants?pageSize=50")
      .then((data) => {
        if (alive) setApplicants(data.data ?? []);
      })
      .catch(() => {
        /* palette stays usable without data */
      });
    return () => {
      alive = false;
    };
  }, [open, user, staff]);

  if (!user) return null;
  const navItems = (NAV_CONFIG[user.role] ?? []).flatMap((g) => g.items);
  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command menu"
      description="Search navigation, positions and applicants"
    >
      <CommandInput placeholder="Type a command or search…" />
      <CommandList className="max-h-[min(420px,60dvh)] scroll-thin">
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Navigation">
          {navItems.map((item) => (
            <CommandItem
              key={item.view}
              value={`navigation ${item.label} ${item.view}`}
              onSelect={() => run(() => navigate(item.view))}
            >
              <item.icon aria-hidden="true" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {staff && jobs.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Positions">
              {jobs.map((j) => (
                <CommandItem
                  key={j.id}
                  value={`position ${j.title} ${j.position?.positionTitle ?? ""} ${j.position?.itemNumber ?? ""}`}
                  onSelect={() => run(() => navigate("job", { id: String(j.id) }))}
                >
                  <Briefcase aria-hidden="true" />
                  <span className="truncate">{j.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {staff && applicants.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Applicants">
              {applicants.map((a) => (
                <CommandItem
                  key={a.id}
                  value={`applicant ${a.firstName ?? ""} ${a.lastName ?? ""} ${a.emailAddress ?? ""}`}
                  onSelect={() => run(() => navigate("candidate", { id: String(a.id) }))}
                >
                  <UserRound aria-hidden="true" />
                  <span className="truncate">
                    {fullName({ firstName: a.firstName, lastName: a.lastName })}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Quick actions">
          <CommandItem
            value="sign out"
            onSelect={() => {
              onOpenChange(false);
              performSignOut();
            }}
          >
            <LogOut aria-hidden="true" />
            <span>Sign out</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
