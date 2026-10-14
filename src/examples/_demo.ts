// ============================================================================
// RMIS — Demo adapters for component examples (src/examples/_demo).
//
// Documentation/demo-only transport: the official UploadCN demo engine
// (`mockAdapter` from @uploadcn/core — the same adapter the uploadcn docs
// use), so <FolderUpload adapter={demoAdapter} … /> runs end-to-end with no
// backend: simulated throughput, eased progress ticks, flying-file motion.
// Nothing here touches the real RMIS API — production hosts pass their own
// adapter (see section 07 Supporting Documents for the authenticated
// FormData/XHR adapter wired to POST /api/applicant/documents).
// ============================================================================

import { mockAdapter, type UploadAdapter, type MockUploadResult } from "@uploadcn/core";

/** Simulated upload transport — ~1–2s per file, real-looking progress. */
export const demoAdapter: UploadAdapter<MockUploadResult> = mockAdapter({
  latency: 250,
  speed: 1024 * 768,
});
