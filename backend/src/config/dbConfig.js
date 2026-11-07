// Builds the PostgreSQL pool settings from the environment. Pure (takes env, returns a plain object) so it can be tested.
//
// Two ways to point at a database:
//   DATABASE_URL                      postgresql://user:password@host:port/dbname   (Supabase, Render, any managed PostgreSQL)
//   DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME   (local development; used only when DATABASE_URL is not set)
//
// TLS (DATABASE_SSL):
//   unset   automatic: ON for any DATABASE_URL host that is not localhost, OFF for local DB_* settings
//   disable no TLS (local only)
//   require encrypted connection, certificate NOT verified (works with Supabase out of the box, whose CA is not in Node's store)
//   verify  encrypted AND certificate verified; supply the provider's CA in DATABASE_SSL_CA (PEM text) unless it is a public CA
// Any "sslmode=" in the URL is removed first: node-postgres would let it override these settings.
//
// Pool (a Supabase pooler or small Render plan has few connections; keep this at or below your share of them):
//   DB_POOL_MAX (10), DB_POOL_IDLE_MS (30000), DB_POOL_CONNECT_TIMEOUT_MS (10000)
//   DB_STATEMENT_TIMEOUT_MS: OFF unless set. It is sent as a connection startup parameter, which some poolers (Supabase
//   transaction mode / PgBouncer) reject, so it is never switched on by default.
const int = (v, fallback) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '']);

function stripSslMode(url) {
  try {
    const u = new URL(url);
    u.searchParams.delete('sslmode');
    return u.toString();
  } catch {
    return url;
  }
}

export function buildPoolConfig(env = process.env) {
  const url = env.DATABASE_URL?.trim();
  const mode = (env.DATABASE_SSL || '').trim().toLowerCase();
  if (mode && !['disable', 'require', 'verify'].includes(mode)) {
    throw new Error('DATABASE_SSL must be disable, require or verify.');
  }

  let host;
  if (url) {
    try { host = new URL(url).hostname.toLowerCase(); } catch { throw new Error('DATABASE_URL is not a valid connection URL (postgresql://user:password@host:port/dbname).'); }
  } else {
    host = (env.DB_HOST || '').trim().toLowerCase();
  }

  const wantSsl = mode ? mode !== 'disable' : Boolean(url) && !LOCAL_HOSTS.has(host);
  let ssl = false;
  if (wantSsl) {
    ssl = mode === 'verify'
      ? { rejectUnauthorized: true, ...(env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA.replace(/\\n/g, '\n') } : {}) }
      : { rejectUnauthorized: false };
  }

  const common = {
    max: int(env.DB_POOL_MAX, 10),
    idleTimeoutMillis: int(env.DB_POOL_IDLE_MS, 30_000),
    connectionTimeoutMillis: int(env.DB_POOL_CONNECT_TIMEOUT_MS, 10_000),
    ...(env.DB_STATEMENT_TIMEOUT_MS ? { statement_timeout: int(env.DB_STATEMENT_TIMEOUT_MS, 30_000) } : {}),
    ssl,
  };

  if (url) return { connectionString: stripSslMode(url), ...common };
  return { user: env.DB_USER, host: env.DB_HOST, database: env.DB_NAME, password: env.DB_PASSWORD, port: env.DB_PORT, ...common };
}

// "host:port/dbname" of the database these settings point at, for logs and confirmation prompts. Never includes the user
// name or password. Returns "(unknown)" when it cannot tell.
export function describeDatabaseTarget(env = process.env) {
  try {
    const url = env.DATABASE_URL?.trim();
    if (url) {
      const u = new URL(url);
      return `${u.hostname}:${u.port || '5432'}/${decodeURIComponent(u.pathname.replace(/^\//, '')) || '(default)'}`;
    }
    if (env.DB_HOST || env.DB_NAME) return `${env.DB_HOST || 'localhost'}:${env.DB_PORT || '5432'}/${env.DB_NAME || '(default)'}`;
  } catch { /* fall through */ }
  return '(unknown)';
}

export function isLocalDatabase(env = process.env) {
  let host = (env.DB_HOST || '').trim().toLowerCase();
  if (env.DATABASE_URL?.trim()) {
    try { host = new URL(env.DATABASE_URL.trim()).hostname.toLowerCase(); } catch { return false; } // unparsable: do not call it local
  }
  return LOCAL_HOSTS.has(host);
}
