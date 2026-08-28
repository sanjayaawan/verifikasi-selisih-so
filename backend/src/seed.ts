import bcrypt from "bcryptjs";
import { db } from "./db";

function upsertUser(username: string, password: string, full_name: string, role: "auditor" | "auditee") {
  const hash = bcrypt.hashSync(password, 10);
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    db.prepare("UPDATE users SET password_hash = ?, full_name = ?, role = ? WHERE username = ?")
      .run(hash, full_name, role, username);
    console.log(`Updated user: ${username} (${role})`);
  } else {
    db.prepare("INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)")
      .run(username, hash, full_name, role);
    console.log(`Created user: ${username} (${role})`);
  }
}

upsertUser("auditor1", "auditor123", "Auditor Satu", "auditor");
upsertUser("auditee1", "auditee123", "Auditee Satu", "auditee");

console.log("Seed selesai. GANTI PASSWORD DEFAULT INI sebelum dipakai di lingkungan nyata.");
