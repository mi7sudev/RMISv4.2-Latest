// ============================================================================
// RMIS — Eligibility vocabulary resolution (server-only). Single source for
// the find-or-create logic shared by the applicant eligibilities CRUD and the
// PDS auto-apply. Canonical matching (case/whitespace-insensitive, via
// canonicalEligibilityName) guards the EligibilityRef vocabulary so a
// submitted title can never spawn a near-duplicate dropdown option, and
// registry-known titles resolve to the canonical CSC name instead of
// creating a draft row (the profile dropdown already carries the registry).
// ============================================================================

import { type Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { CSC_ELIGIBILITY_REGISTRY, canonicalEligibilityName } from "@/lib/constants";

const REGISTRY_BY_KEY = new Map(
  CSC_ELIGIBILITY_REGISTRY.map((r) => [canonicalEligibilityName(r.name), r.name])
);

/**
 * Resolve a submitted title against the eligibility vocabulary:
 *  1. explicit eligibilityId wins (the row the user actually picked);
 *  2. canonical match against existing refs reuses the stored row;
 *  3. canonical match against the CSC registry resolves to the canonical
 *     name WITHOUT creating a draft row;
 *  4. otherwise find-or-create a draft reference row (index 99).
 */
export async function resolveEligibilityTitle(
  title: string,
  eligibilityId?: number | null,
  // The Prisma client (or transaction client) to run against. Callers inside
  // a $transaction MUST pass their tx — a bare db write inside an open
  // transaction deadlocks SQLite (the tx holds the write lock).
  client: Prisma.TransactionClient | typeof db = db
): Promise<string> {
  if (eligibilityId) {
    const ref = await client.eligibilityRef.findUnique({ where: { id: eligibilityId } });
    if (ref) return ref.name;
  }
  const key = canonicalEligibilityName(title);
  const refs = await client.eligibilityRef.findMany();
  const found = refs.find((r) => canonicalEligibilityName(r.name) === key);
  if (found) return found.name;
  const registryName = REGISTRY_BY_KEY.get(key);
  if (registryName) return registryName;
  const created = await client.eligibilityRef.create({ data: { name: title.trim(), index: 99 } });
  return created.name;
}
