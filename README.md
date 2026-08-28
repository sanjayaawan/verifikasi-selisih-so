# Verifikasi Selisih SO

Implementasi Phase 1 sesuai `PRD_Verifikasi_Selisih_SO.md`. Sudah diuji end-to-end
dengan file Excel source asli (91 MINUS + 107 PLUS ter-import benar, kalkulasi
`Qty = SO − Fisik` dan `Value = Price × Discrepancy` match formula Excel).

## Menjalankan

**Backend** (Node.js + Express + TypeScript + SQLite):
```
cd backend
npm install
npm run seed    # buat user awal
npm run dev      # http://localhost:4000
```

**Frontend** (React + TypeScript + Tailwind, via Vite):
```
cd frontend
npm install
npm run dev      # http://localhost:5173, proxy /api ke backend
```

## User default (GANTI PASSWORD sebelum dipakai nyata)

| Role | Username | Password |
|---|---|---|
| Auditor | `auditor1` | `auditor123` |
| Auditee | `auditee1` | `auditee123` |

Tambah user lain langsung lewat `backend/src/seed.ts` atau insert manual ke tabel `users` (password di-hash pakai bcrypt).

## Yang sudah diimplementasikan (sesuai PRD)

- Import Sheet1 (blok MINUS kolom A-G, blok PLUS kolom I-O) — persis struktur hasil reverse engineering.
- Validasi Fisik server-side sesuai batas Excel (MINUS: SO+1..Begin, PLUS: Begin..SO-1), pesan error generik tanpa membocorkan angka batas ke Auditee.
- **Field-level access control**: endpoint yang dipanggil Auditee (`/verification/search`, response `/verification/submit`, `/verification/mine`) tidak pernah mengirim `begin_stock/stock_opname/original_discrepancy/price/value/submission_qty`. Sudah diverifikasi lewat curl test manual (lihat riwayat percakapan).
- Workflow: draft → submitted → approved/rejected → exported, dengan audit_logs untuk tiap perubahan status.
- `discrepancy_category` internal (salah_hitung/tidak_terhitung) dipertahankan meski `main_reason` yang di-export selalu "Salah Hitung SO".
- Export tanpa hard-coded row reference — query seluruh record `approved`, memperbaiki bug row 17-25 yang ditemukan di Excel asli.
- Dashboard KPI dari data nyata (outstanding, progress %, recent verification).

## Belum diimplementasikan / perlu keputusan lanjutan sebelum go-live

- **Assignment auditee ke item tertentu** — saat ini semua Auditee bisa cari & input Stock Code apa saja. Kalau perlu dibatasi per Commodity/Location/area, itu penambahan skema + middleware baru, belum ada di Phase 1 ini.
- **Manajemen user** — belum ada UI untuk tambah/nonaktifkan user, hanya lewat seed script.
- **Reset password** — belum ada flow, ganti manual di DB.
- **Deployment** — ini masih development build (SQLite file lokal). Untuk produksi: pindah ke Postgres/MySQL kalau butuh multi-instance, taruh backend di belakang HTTPS, dan JWT_SECRET wajib diganti dari default (`backend/src/auth.ts`).
- Test suite otomatis (§16 PRD) belum ditulis — pengujian sejauh ini manual via curl terhadap data source asli.

## Struktur

```
backend/
  src/
    db.ts                 — schema SQLite (§4 PRD)
    auth.ts                — JWT + role middleware
    routes/
      source.ts            — import Sheet1
      verification.ts      — search (Auditee), submit, list/approve/reject (Auditor)
      exportRoute.ts        — export tanpa hard-coded row ref
      dashboard.ts          — KPI
frontend/
  src/
    pages/
      Login.tsx
      AuditeeForm.tsx       — input buta, tanpa lihat source figures
      AuditorDashboard.tsx  — review, approve/reject, export, dashboard
```
