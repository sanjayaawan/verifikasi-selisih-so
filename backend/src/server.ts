import express from "express";
import cors from "cors";
import "./db"; // memastikan schema ter-init di startup
import { authRouter } from "./routes/auth";
import { sourceRouter } from "./routes/source";
import { verificationRouter } from "./routes/verification";
import { exportRouter } from "./routes/exportRoute";
import { dashboardRouter } from "./routes/dashboard";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/source", sourceRouter);
app.use("/api/verification", verificationRouter);
app.use("/api/export", exportRouter);
app.use("/api/dashboard", dashboardRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Backend jalan di http://localhost:${PORT}`));
