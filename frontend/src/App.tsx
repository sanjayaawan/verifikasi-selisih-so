import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import AuditeeForm from "./pages/AuditeeForm";
import AuditorDashboard from "./pages/AuditorDashboard";
import { getUser } from "./api";

function Protected({ role, children }: { role: "auditor" | "auditee"; children: JSX.Element }) {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={user.role === "auditor" ? "/auditor" : "/auditee"} replace />;
  return children;
}

export default function App() {
  const user = getUser();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/auditee"
        element={
          <Protected role="auditee">
            <AuditeeForm />
          </Protected>
        }
      />
      <Route
        path="/auditor"
        element={
          <Protected role="auditor">
            <AuditorDashboard />
          </Protected>
        }
      />
      <Route
        path="/"
        element={<Navigate to={user ? (user.role === "auditor" ? "/auditor" : "/auditee") : "/login"} replace />}
      />
    </Routes>
  );
}
