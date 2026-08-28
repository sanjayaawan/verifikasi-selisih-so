import { useEffect, useState } from "react";
import { api, clearSession, getUser } from "../api";
import { useNavigate } from "react-router-dom";

type Mode = "MINUS" | "PLUS";

interface FoundItem {
  source_item_id: number;
  stock_code: string;
  item_name: string;
  commodity: string | null;
  discrepancy_type: Mode;
  existing_status: string | null;
}

export default function AuditeeForm() {
  const user = getUser();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("MINUS");
  const [stockCode, setStockCode] = useState("");
  const [found, setFound] = useState<FoundItem | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [physicalQty, setPhysicalQty] = useState("");
  const [location, setLocation] = useState("");
  const [checkedBy, setCheckedBy] = useState("");
  const [cycleQty, setCycleQty] = useState("");
  const [cycleDate, setCycleDate] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [mine, setMine] = useState<any[]>([]);

  async function loadMine() {
    try {
      setMine(await api.myVerifications());
    } catch {
      /* diamkan — bukan blocking */
    }
  }

  useEffect(() => {
    loadMine();
  }, []);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchError(null);
    setFound(null);
    setSubmitOk(null);
    try {
      const item = await api.searchItem(stockCode.trim(), mode);
      setFound(item);
    } catch (err: any) {
      setSearchError(err.message);
    }
  }

  async function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!found) return;
    setSubmitError(null);
    setSubmitOk(null);
    setBusy(true);
    try {
      await api.submitVerification({
        source_item_id: found.source_item_id,
        physical_qty: Number(physicalQty),
        location,
        checked_by: checkedBy,
        cycle_count_qty: cycleQty ? Number(cycleQty) : undefined,
        cycle_count_date: cycleDate || undefined,
      });
      setSubmitOk(`Stock Code ${found.stock_code} berhasil diajukan, menunggu review Auditor.`);
      setFound(null);
      setStockCode("");
      setPhysicalQty("");
      setLocation("");
      setCheckedBy("");
      setCycleQty("");
      setCycleDate("");
      loadMine();
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    clearSession();
    navigate("/login");
  }

  return (
    <div className="min-h-screen px-4 py-8 max-w-2xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <div>
          <p className="label-eyebrow mb-1">Input Verifikasi Fisik</p>
          <h1 className="font-display text-2xl font-semibold">{user?.full_name}</h1>
        </div>
        <button onClick={logout} className="text-sm text-parchment/50 hover:text-parchment font-mono">
          Keluar
        </button>
      </header>

      <div className="flex gap-2 mb-6">
        {(["MINUS", "PLUS"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setFound(null);
              setStockCode("");
            }}
            className={`flex-1 py-2.5 rounded-sm font-display font-semibold text-sm border transition-colors ${
              mode === m
                ? "bg-brass text-ledger-950 border-brass"
                : "border-ledger-700 text-parchment/70 hover:border-brass/50"
            }`}
          >
            DISCREPANCY {m}
          </button>
        ))}
      </div>

      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          value={stockCode}
          onChange={(e) => setStockCode(e.target.value)}
          placeholder="Cari Stock Code…"
          className="flex-1 bg-ledger-900 border border-ledger-700 rounded-sm px-3 py-2.5 font-mono text-sm"
          required
        />
        <button type="submit" className="bg-ledger-800 border border-ledger-700 px-4 rounded-sm font-display font-medium text-sm hover:border-brass/50">
          Cari
        </button>
      </form>

      {searchError && (
        <p className="text-brick text-sm font-mono border border-brick/40 bg-brick/10 rounded-sm px-3 py-2 mb-6">
          {searchError}
        </p>
      )}

      {found && (
        <form onSubmit={handleSubmitForm} className="bg-ledger-900 border border-ledger-700 rounded-sm p-5 space-y-4 mb-8">
          <div className="border-b border-ledger-700 pb-3 mb-1">
            <p className="label-eyebrow mb-1">Item ditemukan</p>
            <p className="font-mono text-sm">{found.stock_code} — {found.item_name}</p>
            <p className="font-mono text-xs text-parchment/50">Commodity: {found.commodity ?? "-"}</p>
            {found.existing_status && (
              <p className="font-mono text-xs text-brass mt-1">Status pengajuan sebelumnya: {found.existing_status}</p>
            )}
          </div>

          <Field label="Qty Fisik (hasil hitung ulang)" required>
            <input
              type="number"
              value={physicalQty}
              onChange={(e) => setPhysicalQty(e.target.value)}
              className="w-full bg-ledger-950 border border-ledger-700 rounded-sm px-3 py-2 font-mono text-sm"
              required
            />
          </Field>
          <Field label="Location">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full bg-ledger-950 border border-ledger-700 rounded-sm px-3 py-2 font-mono text-sm"
            />
          </Field>
          <Field label="Check By">
            <input
              value={checkedBy}
              onChange={(e) => setCheckedBy(e.target.value)}
              className="w-full bg-ledger-950 border border-ledger-700 rounded-sm px-3 py-2 font-mono text-sm"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Qty CC">
              <input
                type="number"
                value={cycleQty}
                onChange={(e) => setCycleQty(e.target.value)}
                className="w-full bg-ledger-950 border border-ledger-700 rounded-sm px-3 py-2 font-mono text-sm"
              />
            </Field>
            <Field label="Tgl CC">
              <input
                type="date"
                value={cycleDate}
                onChange={(e) => setCycleDate(e.target.value)}
                className="w-full bg-ledger-950 border border-ledger-700 rounded-sm px-3 py-2 font-mono text-sm"
              />
            </Field>
          </div>

          {submitError && (
            <p className="text-brick text-sm font-mono border border-brick/40 bg-brick/10 rounded-sm px-3 py-2">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full bg-brass hover:bg-brassLight transition-colors text-ledger-950 font-display font-semibold py-2.5 rounded-sm disabled:opacity-50"
          >
            {busy ? "Mengirim…" : "Ajukan Verifikasi"}
          </button>
        </form>
      )}

      {submitOk && (
        <p className="text-moss text-sm font-mono border border-moss/40 bg-moss/10 rounded-sm px-3 py-2 mb-8">
          {submitOk}
        </p>
      )}

      <section>
        <p className="label-eyebrow mb-3">Pengajuan Saya</p>
        {mine.length === 0 ? (
          <p className="text-sm text-parchment/40 font-mono">Belum ada pengajuan.</p>
        ) : (
          <div className="space-y-2">
            {mine.map((m) => (
              <div key={m.id} className="flex items-center justify-between bg-ledger-900 border border-ledger-700 rounded-sm px-3 py-2.5">
                <div>
                  <p className="font-mono text-sm">{m.stock_code} · {m.discrepancy_type}</p>
                  {m.rejection_reason && (
                    <p className="font-mono text-xs text-brick mt-0.5">Ditolak: {m.rejection_reason}</p>
                  )}
                </div>
                <StatusBadge status={m.status} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="label-eyebrow block mb-1.5">
        {label}
        {required && <span className="text-brick"> *</span>}
      </label>
      {children}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: "bg-ledger-700 text-parchment/70",
    submitted: "bg-brass/20 text-brassLight border border-brass/40",
    approved: "bg-moss/20 text-moss border border-moss/40",
    rejected: "bg-brick/20 text-brick border border-brick/40",
    exported: "bg-parchment/10 text-parchment border border-parchment/30",
  };
  return (
    <span className={`text-xs font-mono px-2 py-1 rounded-sm ${styles[status] ?? ""}`}>
      {status}
    </span>
  );
}
