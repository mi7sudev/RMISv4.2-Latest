// ============================================================================
// RMIS — Reference constants (spec §5.9, §7.10): divisions, position types,
// CSC education options (MC 07 s. 2025), eligibility registry.
// ============================================================================

/**
 * Canonical comparison key for eligibility names: casefold + collapsed inner
 * whitespace. Used everywhere eligibility titles meet vocabulary (the profile
 * dropdown merge and the server-side find-or-create) so "CAREER SERVICE
 * PROFESSIONAL (Second Level)" and "career  service  professional (second
 * level)" can never mount as two options. Pure + client-safe on purpose.
 */
export function canonicalEligibilityName(name: string): string {
  return name.replace(/\s+/g, " ").trim().toUpperCase();
}

/**
 * Divisions — MOM 2026-10-13 (homepage revision: "Put the new and updated
 * division names"). Synced to the current DOST-MIRDC organizational structure
 * (mirdc.dost.gov.ph key-officials): MPRD and TSSS are abolished; TSD is now
 * Technology Solutions (testing moved to the new ATD); PMD is Planning and
 * Management; PERDD is Product and Equipment (was Power and Energy); AMMRDD
 * gains "and Development". Stored on Position.division as the CODE.
 */
export const DIVISIONS: { code: string; name: string }[] = [
  { code: "PMD", name: "Planning and Management Division" },
  { code: "FAD", name: "Finance and Administrative Division" },
  { code: "ATD", name: "Analysis and Testing Division" },
  { code: "TDD", name: "Technology Diffusion Division" },
  { code: "TSD", name: "Technology Solutions Division" },
  { code: "AMMRDD", name: "Advanced Manufacturing and Materials Research and Development Division" },
  { code: "PERDD", name: "Product and Equipment Research and Development Division" },
];

export function divisionName(code: string | null | undefined): string {
  if (!code) return "-";
  const hit = DIVISIONS.find((d) => d.code === code || d.name === code);
  return hit ? `${hit.code} · ${hit.name}` : code;
}

/** Public-facing division display (public landing per the same MOM item):
 *  the full official NAME without the code prefix — applicants shouldn't
 *  have to decode acronyms. Unknown/legacy values pass through verbatim. */
export function divisionFullName(code: string | null | undefined): string {
  if (!code) return "-";
  const hit = DIVISIONS.find((d) => d.code === code || d.name === code);
  return hit ? hit.name : code;
}

export const POSITION_TYPES = [
  "Permanent", "Temporary", "Contract of Service", "Job Order",
];

/** CSC MC 07 s. 2025 education requirement options (spec §7.10, §15). */
export const CSC_EDUCATION_FIRST_LEVEL = [
  "High school graduate (prior to 2016)",
  "Grade 10 / Junior High School graduate (starting 2016)",
  "Relevant vocational/trade course",
  "Two years of college education (prior to 2018)",
  "High school graduate with relevant vocational course (prior to 2018)",
  "Grade 12 / Senior High School graduate (starting 2016)",
  "Grade 12 / Senior High School (TVL track)",
  "Grade 10 / JHS graduate with TESDA NC II (starting 2018)",
];

export const CSC_EDUCATION_HIGHER_LEVEL = [
  "Two years of college education",
  "Bachelor's degree",
  "Bachelor's degree relevant to the job",
  "Master's degree",
  "Doctorate degree",
];

export const CSC_ELIGIBILITY_REGISTRY: { name: string; description: string }[] = [
  { name: "Career Service Sub-Professional (First Level)", description: "Career Service Sub-Professional examination passers, first level positions." },
  { name: "Career Service Professional (Second Level)", description: "Career Service Professional examination passers, second level positions." },
  { name: "Honor Graduate (PD 907)", description: "Cum laude or higher, civil service eligibility without examination." },
  { name: "Bar/Board (RA 1080)", description: "Bar or board examination passers; a professional license counts as eligibility." },
  { name: "Barangay Official (RA 7160)", description: "Elected barangay officials completing a term of office." },
  { name: "Veteran Preference (EO 790)", description: "Veterans preference grantee." },
  { name: "Solo Parent (CSC MC 08, s. 2021)", description: "Solo parent eligibility under CSC MC 08, s. 2021." },
  { name: "S&T Specialist (RA 10672)", description: "Science and technology specialist eligibility." },
];

export const ELIGIBILITY_SPECS: Record<string, { kind: "exam" | "license" | "conferment" }> = (() => {
  const map: Record<string, { kind: "exam" | "license" | "conferment" }> = {
    "Career Service Sub-Professional (First Level)": { kind: "exam" },
    "Career Service Professional (Second Level)": { kind: "exam" },
    "Bar/Board (RA 1080)": { kind: "license" },
    "Honor Graduate (PD 907)": { kind: "conferment" },
    "Barangay Official (RA 7160)": { kind: "conferment" },
    "Veteran Preference (EO 790)": { kind: "conferment" },
    "Solo Parent (CSC MC 08, s. 2021)": { kind: "conferment" },
    "S&T Specialist (RA 10672)": { kind: "conferment" },
  };
  return map;
})();

export const EDUCATION_LEVELS = [
  "Elementary", "Secondary", "Senior High School", "Vocational / Trade",
  "College", "Graduate Studies",
];

export const CIVIL_STATUS_OPTIONS = ["Single", "Married", "Widowed", "Separated", "Divorced"];
export const EMPLOYMENT_STATUS_OPTIONS = [
  "Permanent", "Casual", "Contractual", "Contract of Service", "Job Order", "Part-time",
];
export const TRAINING_TYPES = [
  "Managerial", "Supervisory", "Technical", "Non-Technical",
];

export const SEED_PLACES = [
  "Accounting Unit", "Human Resource Development Unit", "Metrology Laboratory", "Materials and Corrosion Laboratory",
];
