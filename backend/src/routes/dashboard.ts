import { Router } from "express";
import { db } from "../db";
import { requireAuth, requireRole } from "../auth";

export const dashboardRouter = Router();

dashboardRouter.get("/", requireAuth, requireRole("auditor"), (_req, res) => {
  const active = db
    .prepare("SELECT id FROM source_uploads WHERE status = 'active' ORDER BY id DESC LIMIT 1")
    .get() as { id: number } | undefined;

  const sourceCounts = active
    ? (db
        .prepare(
          "SELECT discrepancy_type, COUNT(*) AS n FROM source_items WHERE source_upload_id = ? GROUP BY discrepancy_type"
        )
        .all(active.id) as { discrepancy_type: string; n: number }[])
    : [];

  const verifiedCounts = db
    .prepare(
      `SELECT discrepancy_type, COUNT(*) AS n FROM verification_requests
       WHERE status IN ('approved','exported') GROUP BY discrepancy_type`
    )
    .all() as { discrepancy_type: string; n: number }[];

  const totalMinus = sourceCounts.find((c) => c.discrepancy_type === "MINUS")?.n ?? 0;
  const totalPlus = sourceCounts.find((c) => c.discrepancy_type === "PLUS")?.n ?? 0;
  const verifiedMinus = verifiedCounts.find((c) => c.discrepancy_type === "MINUS")?.n ?? 0;
  const verifiedPlus = verifiedCounts.find((c) => c.discrepancy_type === "PLUS")?.n ?? 0;

  const recent = db
    .prepare(
      `SELECT stock_code, discrepancy_type, status, updated_at
       FROM verification_requests ORDER BY updated_at DESC LIMIT 10`
    )
    .all();

  res.json({
    total_source_minus: totalMinus,
    total_source_plus: totalPlus,
    total_verified_minus: verifiedMinus,
    total_verified_plus: verifiedPlus,
    outstanding_minus: Math.max(totalMinus - verifiedMinus, 0),
    outstanding_plus: Math.max(totalPlus - verifiedPlus, 0),
    minus_progress_pct: totalMinus ? Math.round((verifiedMinus / totalMinus) * 100) : 0,
    plus_progress_pct: totalPlus ? Math.round((verifiedPlus / totalPlus) * 100) : 0,
    recent_verification: recent,
  });
});
