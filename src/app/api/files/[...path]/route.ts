// ============================================================================
// RMIS — File serving (spec §6.4, §10). GET /api/files/<applicantId>/<file>.
// A leading "upload" segment is tolerated (doc.filePath form) and stripped.
// Any signed-in user; APPLICANT → own directory only (403 otherwise);
// EVALUATOR/ADMIN → any. `.meta.json` sidecars are never served. Path
// containment guard. Inline disposition with the original filename (RFC 5987);
// Cache-Control: private, no-store.
// ============================================================================

import { NextResponse } from "next/server";
import { handleApi, ApiError } from "@/lib/api";
import { getSessionFromReq } from "@/lib/auth";
import { db } from "@/lib/db";
import fs from "fs";
import path from "path";

const UPLOAD_ROOT = path.join(process.cwd(), "upload");

export const GET = handleApi(async (req: Request, { params }: { params: Promise<{ path: string[] }> }) => {
  const user = await getSessionFromReq(req);
  if (!user) throw new ApiError("Unauthorized", 401);

  const { path: segments } = await params;
  if (!segments || segments.length < 2) throw new ApiError("Not found", 404);
  // Accept both /api/files/<id>/<file> and /api/files/upload/<id>/<file>.
  if (segments[0] === "upload") segments.shift();
  if (segments.length < 2) throw new ApiError("Not found", 404);

  // Containment guard: the resolved path must stay inside the upload root.
  const resolved = path.resolve(UPLOAD_ROOT, ...segments);
  if (!resolved.startsWith(UPLOAD_ROOT + path.sep)) throw new ApiError("Not found", 404);

  const fileName = segments[segments.length - 1];
  if (fileName.endsWith(".meta.json")) throw new ApiError("Not found", 404);

  const applicantId = Number(segments[0]);
  if (!Number.isInteger(applicantId)) throw new ApiError("Not found", 404);
  if (user.role === "APPLICANT" && user.applicantId !== applicantId) {
    throw new ApiError("Forbidden: you may only access your own files", 403);
  }

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new ApiError("Not found", 404);

  const doc = await db.document.findFirst({ where: { applicantId, fileName } });
  const contentType = doc?.mimeType || "application/octet-stream";
  const dispositionName = encodeURIComponent(doc?.originalName || fileName);

  const data = fs.readFileSync(resolved);
  return new NextResponse(new Uint8Array(data), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename*=UTF-8''${dispositionName}`,
      "Cache-Control": "private, no-store",
    },
  });
});
