import pg from "pg";
import dotenv from "dotenv";
import { buildPoolConfig } from "./dbConfig.js";

dotenv.config();

const { Pool } = pg;

const pool = new Pool(buildPoolConfig());

// An idle connection can be dropped by the database, its pooler or the network (Supabase restarts, idle cut-offs).
// node-postgres then emits 'error' on the POOL; with no listener Node treats that as an uncaught exception and the
// whole backend dies. The failed client is discarded by the pool and the next query opens a new one.
pool.on("error", (err) => {
    console.error(`PostgreSQL pool error on an idle connection (${err?.code ?? err?.name ?? "error"}): ${String(err?.message ?? "").slice(0, 120)}`);
});

export default pool;
