import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setSession } from "../api";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.login(username, password);
      setSession(data.token, data.user);
      navigate(data.user.role === "auditor" ? "/auditor" : "/auditee");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="label-eyebrow mb-2">Buku Selisih Stock Opname</p>
          <h1 className="font-display text-3xl font-semibold text-parchment leading-tight">
            Verifikasi Selisih SO
          </h1>
          <p className="text-sm text-parchment/50 mt-2 font-mono">
            Sistem pengganti form Excel — reason: salah hitung &amp; tidak terhitung
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-ledger-900 border border-ledger-700 rounded-sm p-6 space-y-4">
          <div>
            <label className="label-eyebrow block mb-1.5">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-ledger-950 border border-ledger-700 rounded-sm px-3 py-2 text-parchment font-mono text-sm"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="label-eyebrow block mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-ledger-950 border border-ledger-700 rounded-sm px-3 py-2 text-parchment font-mono text-sm"
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <p className="text-brick text-sm font-mono border border-brick/40 bg-brick/10 rounded-sm px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brass hover:bg-brassLight transition-colors text-ledger-950 font-display font-semibold py-2.5 rounded-sm disabled:opacity-50"
          >
            {loading ? "Memproses…" : "Masuk"}
          </button>
        </form>
      </div>
    </div>
  );
}
