import { Router } from "express";
import { db } from "../db";
import { requireAuth, requireRole, AuthedRequest } from "../auth";

export const exportRouter = Router();

// Struktur output mengikuti Export sheet asli: stockCode, Qty, MainReason, Reason.
// TIDAK ADA reference row hard-coded — inilah yang memperbaiki bug Excel
// (DISCP MINUS row 17-25 hilang) yang ditemukan saat reverse engineering (§9 PRD).
exportRouter.get("/", requireAuth, requireRole("auditor"), (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT id, discrepancy_type, stock_code, submission_qty, main_reason, reason_description
       FROM verification_requests WHERE status = 'approved' ORDER BY discrepancy_type, stock_code`
    )
    .all() as any[];

  if (rows.length === 0) {
    return res.status(400).json({ error: "Tidak ada pengajuan berstatus approved untuk di-export" });
  }

  const markExported = db.prepare(
    `UPDATE verification_requests SET status='exported', exported_at=datetime('now'), updated_at=datetime('now'), updated_by=? WHERE id=?`
  );
  const logInsert = db.prepare(
    `INSERT INTO audit_logs (entity, entity_id, action, changed_by) VALUES ('verification_request', ?, 'export', ?)`
  );

  const tx = db.transaction(() => {
    for (const r of rows) {
      markExported.run(req.user!.id, r.id);
      logInsert.run(r.id, req.user!.id);
    }
  });
  tx();

  const minus = rows
    .filter((r) => r.discrepancy_type === "MINUS")
    .map((r) => ({ stockCode: r.stock_code, Qty: r.submission_qty, MainReason: r.main_reason, Reason: r.reason_description }));
  const plus = rows
    .filter((r) => r.discrepancy_type === "PLUS")
    .map((r) => ({ stockCode: r.stock_code, Qty: r.submission_qty, MainReason: r.main_reason, Reason: r.reason_description }));

  res.json({ minus, plus, total: rows.length });
});
