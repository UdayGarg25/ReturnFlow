// Guard for `npm run db:seed-admin`. Pure (takes env, returns a list of problems) so it can be tested without a database.
//
// The public demo Admin (admin@returnflow.test with the published demo password) is public on purpose. This script, run
// against a real database, must never create an admin with that identity or that password, or with a weak one.
// "Real database" = NODE_ENV=production OR a DATABASE_URL (a remote/managed database). Local development (neither set)
// keeps the old behaviour: the demo defaults are allowed so a local database can be set up quickly.
export const DEMO_ADMIN_EMAIL = 'admin@returnflow.test';
export const PUBLIC_DEMO_PASSWORD = 'Password123!';
export const MIN_ADMIN_PASSWORD_LENGTH = 12;

export function checkAdminSeedSafety(env = process.env) {
  const real = env.NODE_ENV === 'production' || Boolean(env.DATABASE_URL?.trim());
  if (!real) return [];

  const problems = [];
  const email = env.ADMIN_EMAIL?.trim().toLowerCase() ?? '';
  const password = env.ADMIN_PASSWORD ?? '';

  if (!email) {
    problems.push('ADMIN_EMAIL is not set. Set it to your own address (the default is the public demo admin).');
  } else if (email === DEMO_ADMIN_EMAIL || email.endsWith('@returnflow.test')) {
    problems.push('ADMIN_EMAIL is the public demo admin (or another @returnflow.test demo address). Use your own address.');
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    problems.push('ADMIN_EMAIL is not a valid email address.');
  }

  if (!password) {
    problems.push('ADMIN_PASSWORD is not set (the default is the public demo password).');
  } else {
    if (password.toLowerCase() === PUBLIC_DEMO_PASSWORD.toLowerCase()) problems.push('ADMIN_PASSWORD is the public demo password.');
    if (password.length < MIN_ADMIN_PASSWORD_LENGTH) problems.push(`ADMIN_PASSWORD must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters.`);
    const local = email.split('@')[0];
    if (local.length >= 4 && password.toLowerCase().includes(local)) problems.push('ADMIN_PASSWORD must not contain the email name.');
  }
  return problems;
}
