// Guard for src/config/setup.js. Pure (takes args and env) so it can be tested without a database.
//
// "Real database" means NODE_ENV=production OR a DATABASE_URL (a remote/managed database). Local development with the
// DB_* variables is not affected.
//   --reset      drops every ReturnFlow table             -> needs CONFIRM_DROP_ALL_TABLES=yes
//   --seed       inserts demo accounts (well-known password, including an ADMIN) with fixed ids and demo business data
//   --demo-only  deletes and re-creates the demo business data
//                (both of the above)                      -> need CONFIRM_SEED_DEMO_DATA=yes
export function checkSetupSafety(args, env = process.env) {
  const realDatabase = env.NODE_ENV === 'production' || Boolean(env.DATABASE_URL?.trim());
  if (!realDatabase) return null;

  const needs = [];
  if (args.includes('--reset') && env.CONFIRM_DROP_ALL_TABLES !== 'yes') {
    needs.push('--reset would DROP every ReturnFlow table. Set CONFIRM_DROP_ALL_TABLES=yes only if you really want to erase this database.');
  }
  if ((args.includes('--seed') || args.includes('--demo-only')) && env.CONFIRM_SEED_DEMO_DATA !== 'yes') {
    needs.push('--seed / --demo-only would insert demo accounts with a publicly documented password (including an ADMIN) and demo records. Set CONFIRM_SEED_DEMO_DATA=yes only for a demo or staging database, never for real data.');
  }
  if (needs.length === 0) return null;
  return `Refusing to run: this looks like a real database (NODE_ENV=production or DATABASE_URL is set).\n- ${needs.join('\n- ')}\nNothing was changed. For a fresh production database run only: npm run db:schema, then npm run db:seed-admin (with ADMIN_EMAIL and ADMIN_PASSWORD).`;
}

// ---------------------------------------------------------------------------------------------------------------
// Second layer, for ANY database (including your local one): the seeded demo accounts. If the target contains accounts that
// are NOT the seeded demo accounts (a real person registered, a personal account), then --reset (drops every table) and
// --seed (fixed-id demo users) need the same explicit confirmation as a remote database. --demo-only is left alone on purpose:
// it only replaces the demo accounts' own data and refuses by itself if a non-demo account has orders for demo products.
export const DEMO_ACCOUNT_EMAILS = Object.freeze([
  'alice@returnflow.test', 'bob@returnflow.test', 'priya@returnflow.test', 'rohan@returnflow.test',
  'sam@returnflow.test', 'sara@returnflow.test', 'pete@returnflow.test', 'wendy@returnflow.test', 'admin@returnflow.test',
]);

export function checkSetupDataSafety(args, env, nonDemoAccounts, target = '(unknown)') {
  if (!(nonDemoAccounts > 0)) return null;
  const needs = [];
  if (args.includes('--reset') && env.CONFIRM_DROP_ALL_TABLES !== 'yes') {
    needs.push('--reset would DROP every ReturnFlow table, including those accounts. Set CONFIRM_DROP_ALL_TABLES=yes only if you really want to erase this database.');
  }
  if (args.includes('--seed') && env.CONFIRM_SEED_DEMO_DATA !== 'yes') {
    needs.push('--seed inserts demo users with fixed ids into a database that already has real accounts. Set CONFIRM_SEED_DEMO_DATA=yes only if that is what you want.');
  }
  if (needs.length === 0) return null;
  return `Refusing to run on ${target}: it contains ${nonDemoAccounts} account(s) that are not the seeded demo accounts.\n- ${needs.join('\n- ')}\nNothing was changed.`;
}
