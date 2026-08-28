import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db";
import { signToken } from "../auth";

export const authRouter = Router();

authRouter.post("/login", (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    return res.status(400).json({ error: "username dan password wajib diisi" });
  }
  const user = db
    .prepare("SELECT id, username, password_hash, full_name, role FROM users WHERE username = ?")
    .get(username) as any;
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Username atau password salah" });
  }
  const token = signToken({
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
  });
  res.json({
    token,
    user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role },
  });
});
