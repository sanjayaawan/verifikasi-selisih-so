import { Router } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "../db";
import { requireAuth, requireRole, AuthedRequest } from "../auth";

export const sourceRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Hanya Auditor yang boleh import — Auditee tidak pernah menyentuh source mentah.
sourceRouter.post(
  "/import",
  requireAuth,
  requireRole("auditor"),
  upload.single("file"),
  (req: AuthedRequest, res) => {
    if (!req.file) return res.status(400).json({ error: "File tidak ditemukan" });

    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(req.file.buffer, { type: "buffer" });
    } catch {
      return res.status(400).json({ error: "File tidak bisa dibaca sebagai Excel" });
    }

    const ws = wb.Sheets["Sheet1"];
    if (!ws) return res.status(400).json({ error: 'Sheet "Sheet1" tidak ditemukan di file' });

    // header:1 -> array of arrays, index 0-based. Data riil mulai row 3 (index 2)
    // sesuai struktur yang ditemukan saat reverse engineering.
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

    type Row = {
      discrepancy_type: "MINUS" | "PLUS";
      stock_code: string;
      item_name: string;
      begin_stock: number;
      stock_opname: number;
      discrepancy: number;
      price: number;
      commodity: string | null;
    };

    const parsed: Row[] = [];
    const errors: string[] = [];

    for (let i = 2; i < rows.length; i++) {
      const r = rows[i] ?? [];
      const excelRowNum = i + 1;

      // Blok MINUS: kolom A(0)-G(6)
      const minusStockCode = r[0];
      if (minusStockCode !== null && minusStockCode !== undefined && String(minusStockCode).trim() !== "") {
        const item = validateRow("MINUS", r.slice(0, 7), excelRowNum, errors);
        if (item) parsed.push(item);
      }

      // Blok PLUS: kolom I(8)-O(14)
      const plusStockCode = r[8];
      if (plusStockCode !== null && plusStockCode !== undefined && String(plusStockCode).trim() !== "") {
        const item = validateRow("PLUS", r.slice(8, 15), excelRowNum, errors);
        if (item) parsed.push(item);
      }
    }

    if (parsed.length === 0) {
      return res.status(400).json({ error: "Tidak ada baris data valid ditemukan", details: errors });
    }

    // Cek duplikat stock_code dalam batch yang sama (per type) sebelum commit ke DB.
    const seen = new Set<string>();
    for (const p of parsed) {
      const key = `${p.discrepancy_type}:${p.stock_code}`;
      if (seen.has(key)) {
        return res.status(400).json({
          error: `Stock Code duplikat dalam file: ${p.stock_code} (${p.discrepancy_type})`,
        });
      }
      seen.add(key);
    }

    const versionRow = db
      .prepare("SELECT COALESCE(MAX(version), 0) + 1 AS v FROM source_uploads")
      .get() as { v: number };

    const insertUpload = db.prepare(
      "INSERT INTO source_uploads (filename, uploaded_by, version, status) VALUES (?, ?, ?, 'active')"
    );
    const markSuperseded = db.prepare(
      "UPDATE source_uploads SET status = 'superseded' WHERE status = 'active'"
    );
    const insertItem = db.prepare(`
      INSERT INTO source_items
        (source_upload_id, discrepancy_type, stock_code, item_name, begin_stock, stock_opname, discrepancy, price, commodity)
      VALUES (@source_upload_id, @discrepancy_type, @stock_code, @item_name, @begin_stock, @stock_opname, @discrepancy, @price, @commodity)
    `);

    const tx = db.transaction(() => {
      markSuperseded.run();
      const uploadId = insertUpload.run(req.file!.originalname, req.user!.id, versionRow.v).lastInsertRowid;
      for (const p of parsed) {
        insertItem.run({ source_upload_id: uploadId, ...p });
      }
      return uploadId;
    });

    const uploadId = tx();

    res.json({
      message: "Import berhasil",
      source_upload_id: uploadId,
      total_minus: parsed.filter((p) => p.discrepancy_type === "MINUS").length,
      total_plus: parsed.filter((p) => p.discrepancy_type === "PLUS").length,
      warnings: errors,
    });
  }
);

function validateRow(
  type: "MINUS" | "PLUS",
  cols: any[],
  excelRowNum: number,
  errors: string[]
) {
  const [stock_code, item_name, begin_stock, stock_opname, discrepancy, price, commodity] = cols;
  const num = (v: any) => (v === null || v === undefined || v === "" ? NaN : Number(v));

  const bs = num(begin_stock);
  const so = num(stock_opname);
  const disc = num(discrepancy);
  const pr = num(price);

  if (!stock_code || Number.isNaN(bs) || Number.isNaN(so) || Number.isNaN(disc) || Number.isNaN(pr)) {
    errors.push(`Row ${excelRowNum} (${type}): data tidak lengkap/tidak numerik, dilewati`);
    return null;
  }

  return {
    discrepancy_type: type,
    stock_code: String(stock_code).trim(),
    item_name: item_name ? String(item_name).trim() : "",
    begin_stock: bs,
    stock_opname: so,
    discrepancy: disc,
    price: pr,
    commodity: commodity ? String(commodity).trim() : null,
  };
}

// Ringkasan source aktif — dipakai dashboard Auditor (§19 PRD)
sourceRouter.get("/active-summary", requireAuth, requireRole("auditor"), (_req, res) => {
  const active = db
    .prepare("SELECT id FROM source_uploads WHERE status = 'active' ORDER BY id DESC LIMIT 1")
    .get() as { id: number } | undefined;
  if (!active) return res.json({ total_minus: 0, total_plus: 0 });

  const counts = db
    .prepare(
      "SELECT discrepancy_type, COUNT(*) AS n FROM source_items WHERE source_upload_id = ? GROUP BY discrepancy_type"
    )
    .all(active.id) as { discrepancy_type: string; n: number }[];

  res.json({
    source_upload_id: active.id,
    total_minus: counts.find((c) => c.discrepancy_type === "MINUS")?.n ?? 0,
    total_plus: counts.find((c) => c.discrepancy_type === "PLUS")?.n ?? 0,
  });
});
