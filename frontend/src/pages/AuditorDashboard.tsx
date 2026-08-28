import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, clearSession, getUser } from "../api";
import { StatusBadge } from "./AuditeeForm";

export default function AuditorDashboard() {
  const user = getUser();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [dashboard, setDashboard] = useState<any | null>(null);
  const [pending, setPending] = useState<any[]>([]);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [exportResult, setExportResult] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [d, p] = await Promise.all([api.dashboard(), api.listVerifications("submitted")]);
    setDashboard(d);
    setPending(p);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setImportErr(null);
    setImportMsg(null);
    setBusy(true);
    try {
      const res = await api.importSource(file);
      setImportMsg(`Import berhasil: ${res.total_minus} MINUS, ${res.total_plus} PLUS.`);
      refresh();
    } catch (err: any) {
      setImportErr(err.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleApprove(id: number) {
    await api.approve(id);
    refresh();
  }

  async function submitReject() {
    if (!rejectingId || !rejectReason.trim()) return;
    await api.reject(rejectingId, rejectReason.trim());
    setRejectingId(null);
    setRejectReason("");
    refresh();
  }

  async function handleExport() {
    setBusy(true);
    try {
      const res = await api.exportData();
      setExportResult(res);
      refresh();
    } catch (err: any) {
      setImportErr(err.message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    clearSession();
    navigate("/login");
  }

  return (
    <div className="min-h-screen px-4 py-8 max-w-4xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <div>
          <p className="label-eyebrow mb-1">Panel Auditor</p>
          <h1 className="font-display text-2xl font-semibold">{user?.full_name}</h1>
        </div>
        <button onClick={logout} className="text-sm text-parchment/50 hover:text-parchment font-mono">
          Keluar
        </button>
      </header>

      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <Kpi label="Outstanding MINUS" value={dashboard.outstanding_minus} sub={`${dashboard.minus_progress_pct}% verified`} />
          <Kpi label="Outstanding PLUS" value={dashboard.outstanding_plus} sub={`${dashboard.plus_progress_pct}% verified`} />
          <Kpi label="Total Source MINUS" value={dashboard.total_source_minus} />
          <Kpi label="Total Source PLUS" value={dashboard.total_source_plus} />
        </div>
      )}

      <section className="bg-ledger-900 border border-ledger-700 rounded-sm p-5 mb-8">
        <p className="label-eyebrow mb-3">Import Source (Sheet1)</p>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="flex-1 text-sm font-mono" />
          <button
            onClick={handleImport}
            disabled={busy}
            className="bg-brass hover:bg-brassLight transition-colors text-ledger-950 font-display font-semibold px-4 py-2 rounded-sm text-sm disabled:opacity-50"
          >
            Import
          </button>
        </div>
        {importMsg && <p className="text-moss text-sm font-mono mt-3">{importMsg}</p>}
        {importErr && <p className="text-brick text-sm font-mono mt-3">{importErr}</p>}
      </section>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <p className="label-eyebrow">Menunggu Review ({pending.length})</p>
          <button
            onClick={handleExport}
            disabled={busy}
            className="bg-ledger-800 border border-ledger-700 hover:border-brass/50 text-sm font-display font-medium px-4 py-1.5 rounded-sm disabled:opacity-50"
          >
            Export Approved
          </button>
        </div>

        {pending.length === 0 ? (
          <p className="text-sm text-parchment/40 font-mono">Tidak ada pengajuan menunggu review.</p>
        ) : (
          <div className="space-y-2">
            {pending.map((v) => (
              <div key={v.id} className="bg-ledger-900 border border-ledger-700 rounded-sm p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-mono text-sm">{v.stock_code} — {v.item_name}</p>
                    <p className="font-mono text-xs text-parchment/50">{v.discrepancy_type} · {v.discrepancy_category}</p>
                  </div>
                  <StatusBadge status={v.status} />
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs font-mono text-parchment/70 mb-3">
                  <div>Begin: {v.begin_stock}</div>
                  <div>SO: {v.stock_opname}</div>
                  <div>Fisik: {v.physical_qty}</div>
                  <div>Qty pengajuan: {v.submission_qty}</div>
                  <div>Value: {v.value}</div>
                  <div>Location: {v.location ?? "-"}</div>
                </div>
                <p className="text-xs font-mono text-parchment/50 mb-3">{v.reason_description}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(v.id)}
                    className="bg-moss/20 border border-moss/40 text-moss text-xs font-display font-semibold px-3 py-1.5 rounded-sm hover:bg-moss/30"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setRejectingId(v.id)}
                    className="bg-brick/20 border border-brick/40 text-brick text-xs font-display font-semibold px-3 py-1.5 rounded-sm hover:bg-brick/30"
                  >
                    Reject
                  </button>
                </div>

                {rejectingId === v.id && (
                  <div className="mt-3 flex gap-2">
                    <input
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Alasan reject…"
                      className="flex-1 bg-ledger-950 border border-ledger-700 rounded-sm px-3 py-1.5 text-sm font-mono"
                    />
                    <button onClick={submitReject} className="bg-brick text-ledger-950 text-xs font-display font-semibold px-3 rounded-sm">
                      Kirim
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {exportResult && (
        <section className="bg-ledger-900 border border-ledger-700 rounded-sm p-5">
          <p className="label-eyebrow mb-3">Hasil Export ({exportResult.total} record)</p>
          <pre className="text-xs font-mono text-parchment/70 overflow-x-auto">
            {JSON.stringify(exportResult, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-ledger-900 border border-ledger-700 rounded-sm p-4">
      <p className="label-eyebrow mb-1">{label}</p>
      <p className="font-display text-2xl font-semibold">{value}</p>
      {sub && <p className="text-xs font-mono text-parchment/40 mt-0.5">{sub}</p>}
    </div>
  );
}
