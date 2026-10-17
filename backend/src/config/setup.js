// Usage: node src/config/setup.js [--reset] [--seed]
//   (no flags)  apply schema.sql
//   --seed      also apply seed.sql (demo accounts) and seed-demo.sql (demo business data)
//   --demo-only apply only seed-demo.sql (re-creates the demo business data, keeps every real account)
//   --reset     DROP all ReturnFlow tables first (destructive!)
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pool from "./db.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

const runFile = async (name) => {
    const sql = await readFile(path.join(dir, name), "utf8");
    await pool.query(sql);
    console.log(`Applied ${name}`);
};

try {
    if (args.includes("--reset")) {
        await pool.query(`
            DROP TABLE IF EXISTS invitations, refunds, inspections, pickup_assignments,
                return_requests, order_items, orders, products, users CASCADE;
            DROP FUNCTION IF EXISTS set_updated_at();
        `);
        console.log("Dropped existing tables");
    }
    if (args.includes("--demo-only")) {
        await runFile("seed-demo.sql");
    } else {
    await runFile("schema.sql");
    if (args.includes("--seed")) {
        await runFile("seed.sql");      // demo accounts
        await runFile("seed-demo.sql"); // demo business data (see that file)
    }
    }
} catch (err) {
    console.error("Database setup failed:", err.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
