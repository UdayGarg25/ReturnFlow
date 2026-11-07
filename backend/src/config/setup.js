// Usage: node src/config/setup.js [--reset] [--seed]
//   (no flags)  apply schema.sql
//   --seed      also apply seed.sql (demo accounts) and seed-demo.sql (demo business data)
//   --demo-only apply only seed-demo.sql (re-creates the demo business data, keeps every real account)
//   --reset     DROP all ReturnFlow tables first (destructive!)
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import pool from "./db.js";
import { describeDatabaseTarget } from "./dbConfig.js";
import { checkSetupDataSafety, checkSetupSafety, DEMO_ACCOUNT_EMAILS } from "./setupGuard.js";

const dir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

const runFile = async (name) => {
    const sql = await readFile(path.join(dir, name), "utf8");
    await pool.query(sql);
    console.log(`Applied ${name}`);
};

// Refuse the dangerous flags (--reset, --seed, --demo-only) on anything that looks like a real database unless the
// operator says so explicitly. Runs BEFORE any connection is made. Plain `node src/config/setup.js` is always allowed:
// schema.sql only uses CREATE ... IF NOT EXISTS, so it is safe to run again.
const refusal = checkSetupSafety(args);
if (refusal) {
    console.error(refusal);
    process.exit(1);
}

// Second layer, once connected: which database is this, and does it hold accounts that are not the demo accounts?
// (If the users table does not exist yet, there is nothing to protect.)
const countNonDemoAccounts = async () => {
    try {
        const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM users WHERE LOWER(email) <> ALL($1)", [DEMO_ACCOUNT_EMAILS]);
        return rows[0].n;
    } catch {
        return 0;
    }
};

try {
    const dangerous = args.includes("--reset") || args.includes("--seed") || args.includes("--demo-only");
    if (dangerous) console.log(`Target database: ${describeDatabaseTarget()}`);
    const dataRefusal = dangerous ? checkSetupDataSafety(args, process.env, await countNonDemoAccounts(), describeDatabaseTarget()) : null;
    if (dataRefusal) {
        console.error(dataRefusal);
        process.exitCode = 1;
    } else {
    if (args.includes("--reset")) {
        await pool.query(`
            DROP TABLE IF EXISTS ai_assessments, return_images, invitations, refunds, inspections, pickup_assignments,
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
    }
} catch (err) {
    console.error("Database setup failed:", err.message);
    process.exitCode = 1;
} finally {
    await pool.end();
}
