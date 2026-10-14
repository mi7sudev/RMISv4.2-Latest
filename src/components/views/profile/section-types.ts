// ============================================================================
// RMIS — Shared client-side types for the profile builder sections (§7.4).
// Shapes mirror the wire payloads returned by the applicant API routes.
// Client-safe: no server imports.
// ============================================================================

export type CharacterReference = {
  name?: string | null;
  title?: string | null;
  company?: string | null;
  companyAddress?: string | null;
  email?: string | null;
  contact?: string | null;
};

export type EducationRow = {
  id: number;
  educationLevel: string | null;
  degree: string | null;
  course: string | null;
  specifyOthers: string | null;
  schoolName: string | null;
  ongoing: boolean;
  yearFrom: string | null;
  yearTo: string | null;
  unitsEarned: string | null;
  yearGraduated: string | null;
  awards: string | null;
};

export type WorkRow = {
  id: number;
  positionTitle: string | null;
  employerName: string | null;
  employerAddress: string | null;
  statusOfEmployment: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  isPresentWork: boolean;
  isGovtService: boolean;
  monthlySalary: number | null;
  actualDuties: string | null;
};

export type TrainingRow = {
  id: number;
  title: string | null;
  typeOfTraining: string | null;
  specifyTraining: string | null;
  numberHours: number | null;
  dateFrom: string | null;
  dateTo: string | null;
};

export type EligibilityRow = {
  id: number;
  title: string;
  rating: string | null;
  examDate: string | null;
  examPlace: string | null;
  licenseNumber: string | null;
  licenseValidity: string | null;
};

export type AwardRow = {
  id: number;
  recognitionType: string | null;
  scope: string | null;
  details: string | null;
  category: string | null;
  provider: string | null;
  dateGranted: string | null;
  points: number | null;
};

/** GET /api/applicant/profile — applicant row + parsed characterReferences + 5 ordered sections. */
export type ApplicantProfile = {
  id: number;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  extensionName: string | null;
  emailAddress: string | null;
  mobileNumber: string | null;
  contactNumber: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  gender: string | null;
  civilStatus: string | null;
  citizenship: string | null;
  ethnicity: string | null;
  isPwd: boolean;
  presentAddress: string | null;
  houseNumber: string | null;
  street: string | null;
  subdivision: string | null;
  barangay: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  zipCode: string | null;
  isGovernment: boolean;
  adminCase: boolean;
  adminCaseDetails: string | null;
  crimeCharge: boolean;
  crimeDate: string | null;
  crimeCaseStatus: string | null;
  isProfileComplete: boolean;
  characterReferences: CharacterReference[] | null;
  educations: EducationRow[];
  workExperiences: WorkRow[];
  trainings: TrainingRow[];
  eligibilities: EligibilityRow[];
  awards: AwardRow[];
};

/** GET /api/reference — published lookup vocabularies (§5.9). */
export type ReferenceData = {
  eligibilities: { id: number; name: string }[];
  courses: { id: number; name: string; abbreviation?: string | null }[];
  placesOfAssignment: { id: number; name: string }[];
};

/** ISO datetime → YYYY-MM-DD for <input type="date"> (schema accepts it directly). */
export function dateInput(v: string | null | undefined): string {
  if (!v) return "";
  return v.length >= 10 ? v.slice(0, 10) : v;
}

export function initialsOf(first?: string | null, last?: string | null): string {
  const a = (first ?? "").trim().charAt(0);
  const b = (last ?? "").trim().charAt(0);
  return (a + b).toUpperCase() || "-";
}
