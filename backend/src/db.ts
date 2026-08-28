import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(__dirname, "..", "data.sqlite3");
export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Schema mengikuti Data Model di PRD (§4). Field sensitif
// (begin_stock, stock_opname, original_discrepancy, price, value)
// tetap disimpan satu tabel dengan input Auditee supaya Auditor
// punya konteks penuh saat review — pembatasan akses dilakukan
// di layer API (routes/verification.ts), bukan di skema ini.
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('auditor','auditee')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS source_uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded'))
);

CREATE TABLE IF NOT EXISTS source_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_upload_id INTEGER NOT NULL REFERENCES source_uploads(id),
  discrepancy_type TEXT NOT NULL CHECK (discrepancy_type IN ('MINUS','PLUS')),
  stock_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  begin_stock REAL NOT NULL,
  stock_opname REAL NOT NULL,
  discrepancy REAL NOT NULL,
  price REAL NOT NULL,
  commodity TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_upload_id, discrepancy_type, stock_code)
);

CREATE TABLE IF NOT EXISTS verification_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_item_id INTEGER NOT NULL REFERENCES source_items(id),
  discrepancy_type TEXT NOT NULL CHECK (discrepancy_type IN ('MINUS','PLUS')),
  stock_code TEXT NOT NULL,
  item_name TEXT NOT NULL,
  begin_stock REAL NOT NULL,
  stock_opname REAL NOT NULL,
  original_discrepancy REAL NOT NULL,
  price REAL NOT NULL,
  value REAL NOT NULL,
  physical_qty REAL NOT NULL,
  location TEXT,
  checked_by TEXT,
  cycle_count_qty REAL,
  cycle_count_date TEXT,
  submission_qty REAL NOT NULL,
  main_reason TEXT NOT NULL DEFAULT 'Salah Hitung SO',
  discrepancy_category TEXT NOT NULL CHECK (discrepancy_category IN ('salah_hitung','tidak_terhitung')),
  reason_description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','approved','rejected','exported')),
  submitted_by INTEGER NOT NULL REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  approved_at TEXT,
  rejection_reason TEXT,
  exported_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by INTEGER NOT NULL REFERENCES users(id),
  UNIQUE(source_item_id, discrepancy_type)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_by INTEGER NOT NULL REFERENCES users(id),
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);
