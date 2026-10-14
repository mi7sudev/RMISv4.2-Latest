// ============================================================================
// RMIS — Applicant documents (spec §6.4, §10). APPLICANT-only.
//   POST: multipart file + category (12 categories, default SUPPORTING).
//     Max 10 MB → 413. MIME/extension allowlist → 415. Stored under
//     upload/<applicantId>/<uuid>.<ext>. PROFILE_PICTURE = replace semantics.
//     Audit DOCUMENT_UPLOADED. 201 → document row.
//   GET: own documents, newest first.
// ============================================================================

import { ok, handleApi, ApiError, getClientIp } from "@/lib/api";
import { requireApplicantRow } from "@/lib/auth";
import { db } from "@/lib/db";
import { DOCUMENT_CATEGORIES, UPLOAD_EXTENSIONS } from "@/lib/validation";
import { DOC_STATUS } from "@/lib/document-status";
import { auditLog } from "@/lib/audit";
import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";

const UPLOAD_ROOT = path.join(process.cwd(), "upload");
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB (spec §10)

const ALLOWED_EXT: string[] = [...UPLOAD_EXTENSIONS];

const MIME_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xlsm: "application/vnd.ms-excel.sheet.macroenabled.12",
};
const KNOWN_MIMES = new Set(Object.values(MIME_MAP));

/** Path flattening, control-char strip, ≤120 chars (spec §10). */
function sanitizeOriginalName(name: string): string {
  const base = (name || "file").split(/[\\/]+/).pop() || "file";
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (clean || "file").slice(0, 120);
}

export const POST = handleApi(async (req: Request) => {
  const { user, applicant } = await requireApplicantRow(req);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError("Invalid form data. Expected multipart with a 'file' field.", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new ApiError("A file is required", 400);
  }
  const category = String(form.get("category") || "SUPPORTING").trim() || "SUPPORTING";
  if (!(DOCUMENT_CATEGORIES as readonly string[]).includes(category)) {
    throw new ApiError("Invalid document category", 400);
  }
  if (file.size > MAX_SIZE) {
    throw new ApiError("File exceeds the 10 MB limit", 413);
  }

  const originalName = sanitizeOriginalName(file.name || "file");
  const ext = (originalName.match(/\.([a-zA-Z0-9]+)$/)?.[1] || "").toLowerCase();
  const mime = (file.type || "").toLowerCase();
  const knownMime = mime.startsWith("image/") || KNOWN_MIMES.has(mime);
  const genericMime = mime === "" || mime === "application/octet-stream";
  if (!ALLOWED_EXT.includes(ext) || !(knownMime || genericMime)) {
    throw new ApiError(
      "Unsupported file type. Accepted: images (png, jpg, jpeg, gif, webp, bmp), Excel (xlsx, xls, xlsm), PDF, and Word (doc, docx).",
      415
    );
  }
  // Canonical MIME: infer from the extension when the browser sent something generic.
  const canonicalMime = genericMime ? MIME_MAP[ext] || "application/octet-stream" : mime;

  // PROFILE_PICTURE replace semantics — SAFE ORDER: the new file is written
  // and the row swap committed in one transaction BEFORE the old files are
  // unlinked. Previously the old rows were deleted FIRST, so a failed upload
  // left the applicant with NO picture at all (data loss, not just drift).
  // Any residual orphan file on disk is best-effort cleaned — the DB rows are
  // the source of truth.
  const previousPaths: string[] = [];
  if (category === "PROFILE_PICTURE") {
    const previous = await db.document.findMany({
      where: { applicantId: applicant.id, category: "PROFILE_PICTURE" },
    });
    previousPaths.push(...previous.map((p) => p.filePath));
  }

  const dir = path.join(UPLOAD_ROOT, String(applicant.id));
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${uuid().replace(/-/g, "")}${ext ? "." + ext : ""}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(path.join(dir, fileName), buffer);

  let doc;
  try {
    doc = await db.$transaction(async (tx) => {
      if (previousPaths.length > 0) {
        await tx.document.deleteMany({
          where: { applicantId: applicant.id, category: "PROFILE_PICTURE" },
        });
      }
      return tx.document.create({
        data: {
          applicantId: applicant.id,
          uploadedById: user.id,
          fileName,
          originalName,
          mimeType: canonicalMime,
          size: buffer.byteLength,
          filePath: `upload/${applicant.id}/${fileName}`,
          category,
          status: DOC_STATUS.UPLOADED,
        },
      });
    });
  } catch (e) {
    // Row swap failed — remove the just-written file so no orphan accumulates.
    try {
      fs.rmSync(path.join(dir, fileName), { force: true });
    } catch {
      /* best-effort */
    }
    throw e;
  }

  // Committed — now reclaim the replaced files (best-effort; rows are gone,
  // a leaked file is invisible to the app and reaped by ops).
  for (const p of previousPaths) {
    try {
      fs.rmSync(path.join(process.cwd(), p), { force: true });
    } catch {
      // best-effort file removal
    }
  }

  auditLog({
    userId: user.id,
    userLabel: `${user.username} (${user.email})`,
    userRole: user.role,
    action: "DOCUMENT_UPLOADED",
    entityType: "document",
    entityId: doc.id,
    description: `Uploaded ${category} document "${originalName}" (${buffer.byteLength} bytes)`,
    ipAddress: getClientIp(req),
  });

  return ok(doc, 201);
});

export const GET = handleApi(async (req: Request) => {
  const { applicant } = await requireApplicantRow(req);
  const docs = await db.document.findMany({
    where: { applicantId: applicant.id },
    orderBy: { createdAt: "desc" },
  });
  return ok(docs);
});
