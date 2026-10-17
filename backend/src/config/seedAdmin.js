// Usage: npm run db:seed-admin
// Creates the demo ADMIN account if it does not exist yet. Admins cannot be created through
// registration or invitations, so this controlled script is the only way one comes to exist.
// It never changes or deletes an existing account.
//   ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD override the demo values (use real ones outside local dev).
import pool from "./db.js";
import { hashPassword } from "../utils/password.js";

const email = (process.env.ADMIN_EMAIL || "admin@returnflow.test").trim().toLowerCase();
const name = process.env.ADMIN_NAME || "Admin User";
const password = process.env.ADMIN_PASSWORD || "Password123!";

try {
    if (process.env.NODE_ENV === "production" && !process.env.ADMIN_PASSWORD) {
        throw new Error("Set ADMIN_PASSWORD to create the admin in production.");
    }
    const existing = await pool.query("SELECT role FROM users WHERE LOWER(email) = $1", [email]);
    if (existing.rowCount > 0) {
        console.log(`${email} already exists (role ${existing.rows[0].role}); nothing changed.`);
    } else {
        await pool.query(
            "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'ADMIN')",
            [name, email, await hashPassword(password)],
        );
        console.log(`Created admin ${email}`);
    }
} catch (err) {
    console.error("Admin seed failed:", err.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
