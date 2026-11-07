// Usage: npm run db:seed-admin
// Creates the demo ADMIN account if it does not exist yet. Admins cannot be created through
// registration or invitations, so this controlled script is the only way one comes to exist.
// It never changes or deletes an existing account.
//   ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD override the demo values (use real ones outside local dev).
import pool from "./db.js";
import { hashPassword } from "../utils/password.js";
import { checkAdminSeedSafety } from "./adminSeedGuard.js";
import { describeDatabaseTarget } from "./dbConfig.js";

const email = (process.env.ADMIN_EMAIL || "admin@returnflow.test").trim().toLowerCase();
const name = process.env.ADMIN_NAME || "Admin User";
const password = process.env.ADMIN_PASSWORD || "Password123!";

// On a real database (NODE_ENV=production or a DATABASE_URL) the public demo email, the public demo password and weak
// passwords are refused BEFORE any connection is made. Only names of variables are printed, never their values.
const problems = checkAdminSeedSafety(process.env);
if (problems.length > 0) {
    console.error(`Refusing to create the admin on ${describeDatabaseTarget()}:\n- ${problems.join("\n- ")}\nNothing was changed.`);
    process.exit(1);
}

try {
    console.log(`Target database: ${describeDatabaseTarget()}`);
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
