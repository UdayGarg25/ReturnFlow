-- ============================================================================
-- ReturnFlow - demo accounts (users only)
-- Run AFTER schema.sql on an empty database (use `npm run db:reset` to start clean).
-- Every demo account uses the password:  Password123!   (only the bcrypt hash is stored)
-- The demo business data (products, orders, returns, pickups, inspections, refunds) lives in
-- seed-demo.sql, which `npm run db:seed` / `db:reset` apply right after this file.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------- users ----
INSERT INTO users (id, name, email, password_hash, role) VALUES
 (1, 'Alice Customer', 'alice@returnflow.test', '$2b$10$vlXCmX8yuVUtIDgMrfTFyevkUZBS/8HjflEimOC1bs41EMVKAelgy', 'CUSTOMER'),
 (2, 'Bob Customer',   'bob@returnflow.test',   '$2b$10$vlXCmX8yuVUtIDgMrfTFyevkUZBS/8HjflEimOC1bs41EMVKAelgy', 'CUSTOMER'),
 (3, 'Sam Seller',     'sam@returnflow.test',   '$2b$10$vlXCmX8yuVUtIDgMrfTFyevkUZBS/8HjflEimOC1bs41EMVKAelgy', 'SELLER'),
 (4, 'Sara Seller',    'sara@returnflow.test',  '$2b$10$vlXCmX8yuVUtIDgMrfTFyevkUZBS/8HjflEimOC1bs41EMVKAelgy', 'SELLER'),
 (5, 'Pete Pickup',    'pete@returnflow.test',  '$2b$10$vlXCmX8yuVUtIDgMrfTFyevkUZBS/8HjflEimOC1bs41EMVKAelgy', 'PICKUP_AGENT'),
 (6, 'Wendy Warehouse','wendy@returnflow.test', '$2b$10$vlXCmX8yuVUtIDgMrfTFyevkUZBS/8HjflEimOC1bs41EMVKAelgy', 'WAREHOUSE'),
 (7, 'Admin User',      'admin@returnflow.test', '$2b$10$vlXCmX8yuVUtIDgMrfTFyevkUZBS/8HjflEimOC1bs41EMVKAelgy', 'ADMIN');

SELECT setval(pg_get_serial_sequence('users', 'id'), (SELECT MAX(id) FROM users));

COMMIT;
