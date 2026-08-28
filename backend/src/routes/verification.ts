import { Router } from "express";
import { db } from "../db";
import { requireAuth, requireRole, AuthedRequest } from "../auth";

export const verificationRouter = Router();

const GENERIC_QTY_ERROR = "QTY FISIK YANG ANDA MASUKKAN SALAH, CEK KEMBALI!!!";

function logAudit(entity: string, entityId: number, action: string, changedBy: number, fields?: Record<string, [any, any]>) {
  const insert = db.prepare(`
    INSERT INTO audit_logs (entity, entity_id, action, field_name, old_value, new_value, changed_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  if (!fields) {
    insert.run(entity, entityId, action, null, null, null, changedBy);
    return;
  }
  for (const [field, [oldV, newV]] of Object.entries(fields)) {
    insert.run(entity, entityId, action, field, oldV == null ? null : String(oldV), newV == null ? null : String(newV), changedBy);
  }
}

// ── AUDITEE: cari item hanya by Stock Code. Field sensitif TIDAK PERNAH
// dikirim di response ini — ini kontrol paling kritis di seluruh sistem (§12 PRD).
verificationRouter.get("/search", requireAuth, requireRole("auditee"), (req: AuthedRequest, res) => {
  const { stock_code, discrepancy_type } = req.query as { stock_code?: string; discrepancy_type?: string };
  if (!stock_code || !discrepancy_type || !["MINUS", "PLUS"].includes(discrepancy_type)) {
    return res.status(400).json({ error: "stock_code dan discrepancy_type (MINUS/PLUS) wajib diisi" });
  }

  const active = db
    .prepare("SELECT id FROM source_uploads WHERE status = 'active' ORDER BY id DESC LIMIT 1")
    .get() as { id: number } | undefined;
  if (!active) return res.status(404).json({ error: "Belum ada source data aktif" });

  const item = db
    .prepare(
      `SELECT id, stock_code, item_name, commodity, discrepancy_type
       FROM source_items
       WHERE source_upload_id = ? AND discrepancy_type = ? AND stock_code = ?`
    )
    .get(active.id, discrepancy_type, stock_code) as any;

  if (!item) return res.status(404).json({ error: "Stock Code tidak ditemukan" });

  const existing = db
    .prepare("SELECT status FROM verification_requests WHERE source_item_id = ?")
    .get(item.id) as { status: string } | undefined;

  // Sengaja HANYA field ini yang dikirim ke Auditee — lihat §12 PRD.
  res.json({
    source_item_id: item.id,
    stock_code: item.stock_code,
    item_name: item.item_name,
    commodity: item.commodity,
    discrepancy_type: item.discrepancy_type,
    existing_status: existing?.status ?? null,
  });
});

// ── AUDITEE: submit input fisik. Semua kalkulasi & validasi pakai data
// source yang diambil server-side, tidak pernah dari body request.
verificationRouter.post("/submit", requireAuth, requireRole("auditee"), (req: AuthedRequest, res) => {
  const { source_item_id, physical_qty, location, checked_by, cycle_count_qty, cycle_count_date } = req.body as {
    source_item_id?: number;
    physical_qty?: number;
    location?: string;
    checked_by?: string;
    cycle_count_qty?: number;
    cycle_count_date?: string;
  };

  if (!source_item_id || physical_qty === undefined || physical_qty === null) {
    return res.status(400).json({ error: "source_item_id dan physical_qty wajib diisi" });
  }

  const item = db.prepare("SELECT * FROM source_items WHERE id = ?").get(source_item_id) as any;
  if (!item) return res.status(404).json({ error: "Item tidak ditemukan" });

  const existing = db
    .prepare("SELECT * FROM verification_requests WHERE source_item_id = ?")
    .get(source_item_id) as any;
  if (existing && existing.status !== "draft") {
    return res.status(409).json({ error: `Item ini sudah punya pengajuan berstatus '${existing.status}'` });
  }

  // Batas Fisik — direplikasi persis dari data validation Excel (§5.1 PRD).
  const min = item.discrepancy_type === "MINUS" ? item.stock_opname + 1 : item.begin_stock;
  const max = item.discrepancy_type === "MINUS" ? item.begin_stock : item.stock_opname - 1;
  const fisik = Number(physical_qty);

  if (Number.isNaN(fisik) || fisik < min || fisik > max) {
    // Pesan generik tanpa angka batas — Auditee tidak boleh tahu Begin Stock/SO (§2, §6 PRD).
    return res.status(422).json({ error: GENERIC_QTY_ERROR });
  }

  const submissionQty = item.stock_opname - fisik;
  const value = item.price * item.discrepancy;
  const discrepancyCategory = item.stock_opname === 0 ? "tidak_terhitung" : "salah_hitung";
  const today = new Date().toISOString().slice(0, 10);
  const reasonDescription = `fisik = ${fisik}, di lokasi ${location ?? "-"} = ${fisik}, sdh di CC qty = ${
    cycle_count_qty ?? "-"
  }, by ${checked_by ?? "-"} tgl ${today}`;

  const tx = db.transaction(() => {
    let id: number;
    if (existing) {
      db.prepare(
        `UPDATE verification_requests SET
           physical_qty=@physical_qty, location=@location, checked_by=@checked_by,
           cycle_count_qty=@cycle_count_qty, cycle_count_date=@cycle_count_date,
           submission_qty=@submission_qty, value=@value, discrepancy_category=@discrepancy_category,
           reason_description=@reason_description, status='submitted', rejection_reason=NULL,
           updated_at=datetime('now'), updated_by=@user_id
         WHERE id=@id`
      ).run({
        id: existing.id,
        physical_qty: fisik,
        location,
        checked_by,
        cycle_count_qty,
        cycle_count_date,
        submission_qty: submissionQty,
        value,
        discrepancy_category: discrepancyCategory,
        reason_description: reasonDescription,
        user_id: req.user!.id,
      });
      id = existing.id;
      logAudit("verification_request", id, "resubmit", req.user!.id, {
        status: [existing.status, "submitted"],
        physical_qty: [existing.physical_qty, fisik],
      });
    } else {
      const result = db
        .prepare(
          `INSERT INTO verification_requests
             (source_item_id, discrepancy_type, stock_code, item_name, begin_stock, stock_opname,
              original_discrepancy, price, value, physical_qty, location, checked_by, cycle_count_qty,
              cycle_count_date, submission_qty, main_reason, discrepancy_category, reason_description,
              status, submitted_by, created_by, updated_by)
           VALUES
             (@source_item_id, @discrepancy_type, @stock_code, @item_name, @begin_stock, @stock_opname,
              @original_discrepancy, @price, @value, @physical_qty, @location, @checked_by, @cycle_count_qty,
              @cycle_count_date, @submission_qty, 'Salah Hitung SO', @discrepancy_category, @reason_description,
              'submitted', @user_id, @user_id, @user_id)`
        )
        .run({
          source_item_id: item.id,
          discrepancy_type: item.discrepancy_type,
          stock_code: item.stock_code,
          item_name: item.item_name,
          begin_stock: item.begin_stock,
          stock_opname: item.stock_opname,
          original_discrepancy: item.discrepancy,
          price: item.price,
          value,
          physical_qty: fisik,
          location,
          checked_by,
          cycle_count_qty,
          cycle_count_date,
          submission_qty: submissionQty,
          discrepancy_category: discrepancyCategory,
          reason_description: reasonDescription,
          user_id: req.user!.id,
        });
      id = Number(result.lastInsertRowid);
      logAudit("verification_request", id, "submit", req.user!.id);
    }
    return id;
  });

  const id = tx();

  // Respons ke Auditee TIDAK menyertakan submission_qty/value/begin_stock/stock_opname —
  // submission_qty = stock_opname - fisik akan membocorkan stock_opname kalau dikirim balik.
  res.json({
    id,
    stock_code: item.stock_code,
    discrepancy_type: item.discrepancy_type,
    physical_qty: fisik,
    location,
    checked_by,
    cycle_count_qty,
    cycle_count_date,
    status: "submitted",
  });
});

// ── AUDITOR: daftar pengajuan dengan konteks penuh (source + input Auditee).
verificationRouter.get("/list", requireAuth, requireRole("auditor"), (req: AuthedRequest, res) => {
  const { status, discrepancy_type } = req.query as { status?: string; discrepancy_type?: string };
  let sql = "SELECT * FROM verification_requests WHERE 1=1";
  const params: any[] = [];
  if (status) {
    sql += " AND status = ?";
    params.push(status);
  }
  if (discrepancy_type) {
    sql += " AND discrepancy_type = ?";
    params.push(discrepancy_type);
  }
  sql += " ORDER BY updated_at DESC";
  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// ── AUDITOR: approve
verificationRouter.post("/:id/approve", requireAuth, requireRole("auditor"), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const row = db.prepare("SELECT * FROM verification_requests WHERE id = ?").get(id) as any;
  if (!row) return res.status(404).json({ error: "Pengajuan tidak ditemukan" });
  if (row.status !== "submitted") return res.status(409).json({ error: `Tidak bisa approve dari status '${row.status}'` });

  db.prepare(
    `UPDATE verification_requests SET status='approved', approved_by=?, approved_at=datetime('now'), updated_at=datetime('now'), updated_by=? WHERE id=?`
  ).run(req.user!.id, req.user!.id, id);

  logAudit("verification_request", id, "approve", req.user!.id, { status: [row.status, "approved"] });
  res.json({ message: "Disetujui" });
});

// ── AUDITOR: reject — wajib alasan, kembali ke draft untuk direvisi Auditee
verificationRouter.post("/:id/reject", requireAuth, requireRole("auditor"), (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { rejection_reason } = req.body as { rejection_reason?: string };
  if (!rejection_reason?.trim()) return res.status(400).json({ error: "rejection_reason wajib diisi" });

  const row = db.prepare("SELECT * FROM verification_requests WHERE id = ?").get(id) as any;
  if (!row) return res.status(404).json({ error: "Pengajuan tidak ditemukan" });
  if (row.status !== "submitted") return res.status(409).json({ error: `Tidak bisa reject dari status '${row.status}'` });

  db.prepare(
    `UPDATE verification_requests SET status='draft', rejection_reason=?, updated_at=datetime('now'), updated_by=? WHERE id=?`
  ).run(rejection_reason, req.user!.id, id);

  logAudit("verification_request", id, "reject", req.user!.id, {
    status: [row.status, "draft"],
    rejection_reason: [row.rejection_reason, rejection_reason],
  });
  res.json({ message: "Ditolak, dikembalikan untuk revisi" });
});

// ── AUDITEE: lihat status pengajuan milik sendiri (tanpa field sensitif)
verificationRouter.get("/mine", requireAuth, requireRole("auditee"), (req: AuthedRequest, res) => {
  const rows = db
    .prepare(
      `SELECT id, stock_code, discrepancy_type, physical_qty, location, checked_by,
              cycle_count_qty, cycle_count_date, status, rejection_reason, updated_at
       FROM verification_requests WHERE submitted_by = ? ORDER BY updated_at DESC`
    )
    .all(req.user!.id);
  res.json(rows);
});
