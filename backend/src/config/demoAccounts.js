// The seeded demo accounts: the public Customer, Seller, Pickup Agent, Warehouse and Admin logins (and the other demo
// customers and the second seller). They all share the publicly documented demo password, so nobody may change it.
//
// This is the application's one list of demo accounts. The database has no "is demo" column and the session cookie
// carries only a user id, so a demo account is recognised by its seeded email address. Used by:
//   - auth.service.js     refuses password changes for these accounts (the server decides; the UI only mirrors it) and
//                         reports `isDemoAccount` in every user payload so the frontend does not need its own list,
//   - setupGuard.js       the seed/reset safeguard that tells demo accounts from real ones.
// A test (db-safeguards.test.js) checks that this list matches the seed files exactly.
export const DEMO_ACCOUNT_EMAILS = Object.freeze([
  'alice@returnflow.test', 'bob@returnflow.test', 'priya@returnflow.test', 'rohan@returnflow.test',
  'sam@returnflow.test', 'sara@returnflow.test', 'pete@returnflow.test', 'wendy@returnflow.test', 'admin@returnflow.test',
]);

const DEMO_SET = new Set(DEMO_ACCOUNT_EMAILS);

// Case and surrounding spaces do not matter (emails are stored lower-case, but never trust the caller).
export const isDemoAccountEmail = (email) => typeof email === 'string' && DEMO_SET.has(email.trim().toLowerCase());
