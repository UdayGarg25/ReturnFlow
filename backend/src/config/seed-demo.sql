-- ============================================================================
-- ReturnFlow - demo business data
--
-- A believable merchant ("TechNova Electronics", run by the seller account Sam) with a catalog,
-- an order history and return requests at every stage of the reverse-logistics lifecycle.
--
--   * Safe to run again and again: it first removes ONLY business rows that belong to the demo
--     accounts (alice, bob, priya, rohan, sam, sara, pete, wendy), then re-creates them.
--     Real accounts and their data (any other user, their products, orders...) are never touched.
--     If a non-demo account has orders/returns involving demo products it stops without changing anything.
--   * Dates are relative to NOW(), so the data always looks recent.
--   * Nothing is faked: statuses, timestamps, refunds and the AI columns follow the same rules the
--     backend applies (e.g. a refund exists only for an APPROVED inspection, its amount is the order line).
--   * Run:  npm run db:seed-demo      (or `npm run db:seed` on an empty database, which also creates the users)
--
-- Currency: INR. Product image URLs are placeholders (there is no image storage yet).
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ago(days numeric) RETURNS timestamptz
    LANGUAGE sql AS $$ SELECT NOW() - days * INTERVAL '1 day' $$;

-- ------------------------------------------------------------ extra customers ----
-- Two more customers so the order history is not just Alice and Bob (password: Password123!, same as the other demo users).
INSERT INTO users (name, email, password_hash, role)
SELECT v.name, v.email, (SELECT password_hash FROM users WHERE email = 'alice@returnflow.test'), 'CUSTOMER'
  FROM (VALUES ('Priya Nair', 'priya@returnflow.test'), ('Rohan Mehta', 'rohan@returnflow.test')) AS v(name, email)
 WHERE NOT EXISTS (SELECT 1 FROM users x WHERE LOWER(x.email) = v.email);

-- key -> id for the demo accounts (looked up by email: ids differ between databases)
CREATE TEMP TABLE demo_u ON COMMIT DROP AS
SELECT split_part(email, '@', 1) AS k, id FROM users
 WHERE email IN ('alice@returnflow.test', 'bob@returnflow.test', 'priya@returnflow.test', 'rohan@returnflow.test',
                 'sam@returnflow.test', 'sara@returnflow.test', 'pete@returnflow.test', 'wendy@returnflow.test');

DO $$
BEGIN
    IF (SELECT COUNT(*) FROM demo_u) <> 8 THEN
        RAISE EXCEPTION 'The demo accounts are missing. Run the user seed first (npm run db:seed on an empty database).';
    END IF;
END $$;

-- ----------------------------------------------- remove the previous demo rows ----
CREATE TEMP TABLE demo_products ON COMMIT DROP AS SELECT id FROM products WHERE seller_id IN (SELECT id FROM demo_u);
CREATE TEMP TABLE demo_orders   ON COMMIT DROP AS SELECT id FROM orders   WHERE customer_id IN (SELECT id FROM demo_u);
CREATE TEMP TABLE demo_returns  ON COMMIT DROP AS
SELECT id FROM return_requests WHERE customer_id IN (SELECT id FROM demo_u) OR product_id IN (SELECT id FROM demo_products);

DO $$
BEGIN
    -- never delete someone else's history
    IF EXISTS (SELECT 1 FROM return_requests WHERE customer_id NOT IN (SELECT id FROM demo_u)
                  AND (product_id IN (SELECT id FROM demo_products) OR order_id IN (SELECT id FROM demo_orders)))
       OR EXISTS (SELECT 1 FROM order_items oi JOIN orders o ON o.id = oi.order_id
                   WHERE o.customer_id NOT IN (SELECT id FROM demo_u) AND oi.product_id IN (SELECT id FROM demo_products)) THEN
        RAISE EXCEPTION 'A non-demo account has orders or returns for demo products; refusing to reseed.';
    END IF;
END $$;

DELETE FROM refunds            WHERE return_request_id IN (SELECT id FROM demo_returns) OR customer_id IN (SELECT id FROM demo_u);
DELETE FROM inspections        WHERE return_request_id IN (SELECT id FROM demo_returns);
DELETE FROM pickup_assignments WHERE return_request_id IN (SELECT id FROM demo_returns);
DELETE FROM return_requests    WHERE id IN (SELECT id FROM demo_returns);
DELETE FROM order_items        WHERE order_id IN (SELECT id FROM demo_orders) OR product_id IN (SELECT id FROM demo_products);
DELETE FROM orders             WHERE id IN (SELECT id FROM demo_orders);
DELETE FROM products           WHERE id IN (SELECT id FROM demo_products);

-- --------------------------------------------------------------- products ----
-- Sam (TechNova Electronics): the main catalog, ids 1-10. Sara: a small second shop, ids 11-12,
-- there so the seller-to-seller isolation can be shown. The SKU is part of the description (no SKU column).
INSERT INTO products (id, seller_id, name, description, price, image_url, created_at, updated_at) VALUES
 (1,  (SELECT id FROM demo_u WHERE k='sam'),  'iPhone 16 128GB',          'SKU APL-IP16-128-BLK · 6.1-inch Super Retina XDR, A18 chip, 128 GB, Black',                 69999, 'https://example.com/products/iphone-16-128gb.jpg',      pg_temp.ago(120), pg_temp.ago(120)),
 (2,  (SELECT id FROM demo_u WHERE k='sam'),  'Samsung Galaxy S25',       'SKU SAM-S25-256-NVY · 6.2-inch Dynamic AMOLED, Snapdragon 8 Elite, 256 GB, Navy',            74999, 'https://example.com/products/galaxy-s25.jpg',           pg_temp.ago(118), pg_temp.ago(118)),
 (3,  (SELECT id FROM demo_u WHERE k='sam'),  'Sony WH-1000XM5',          'SKU SNY-WH1000XM5-BLK · Wireless noise-cancelling headphones, 30 h battery, Black',          29999, 'https://example.com/products/sony-wh-1000xm5.jpg',      pg_temp.ago(115), pg_temp.ago(115)),
 (4,  (SELECT id FROM demo_u WHERE k='sam'),  'Apple AirPods Pro 2',      'SKU APL-APP2-USBC · Active noise cancellation, MagSafe case (USB-C)',                       24999, 'https://example.com/products/airpods-pro-2.jpg',        pg_temp.ago(110), pg_temp.ago(110)),
 (5,  (SELECT id FROM demo_u WHERE k='sam'),  'Dell Inspiron 14',         'SKU DEL-INS14-I5-16-512 · 14-inch FHD+, Intel Core i5, 16 GB RAM, 512 GB SSD',               56999, 'https://example.com/products/dell-inspiron-14.jpg',     pg_temp.ago(105), pg_temp.ago(105)),
 (6,  (SELECT id FROM demo_u WHERE k='sam'),  'Lenovo IdeaPad Slim 5',    'SKU LEN-IPS5-R5-16-512 · 14-inch OLED, AMD Ryzen 5, 16 GB RAM, 512 GB SSD',                  59999, 'https://example.com/products/lenovo-ideapad-slim-5.jpg', pg_temp.ago(100), pg_temp.ago(100)),
 (7,  (SELECT id FROM demo_u WHERE k='sam'),  'Apple Watch Series 10',    'SKU APL-AWS10-42-JBK · 42 mm GPS, Jet Black aluminium case, Sport Band',                    46999, 'https://example.com/products/apple-watch-series-10.jpg', pg_temp.ago(95),  pg_temp.ago(95)),
 (8,  (SELECT id FROM demo_u WHERE k='sam'),  'Logitech MX Master 3S',    'SKU LOG-MXM3S-GRY · Wireless performance mouse, 8K DPI, quiet clicks, Graphite',              9995, 'https://example.com/products/logitech-mx-master-3s.jpg', pg_temp.ago(90),  pg_temp.ago(90)),
 (9,  (SELECT id FROM demo_u WHERE k='sam'),  'JBL Flip 6',               'SKU JBL-FLIP6-BLU · Portable Bluetooth speaker, IP67, 12 h playtime, Blue',                  8999, 'https://example.com/products/jbl-flip-6.jpg',            pg_temp.ago(85),  pg_temp.ago(85)),
 (10, (SELECT id FROM demo_u WHERE k='sam'),  'Anker 737 Power Bank',     'SKU ANK-737-24K-BLK · 24,000 mAh, 140 W output, smart digital display',                     11999, 'https://example.com/products/anker-737-power-bank.jpg',  pg_temp.ago(80),  pg_temp.ago(80)),
 (11, (SELECT id FROM demo_u WHERE k='sara'), 'boAt Airdopes 141',        'SKU BOT-AD141-BLK · True wireless earbuds, 42 h playback, ENx noise rejection',              1499, 'https://example.com/products/boat-airdopes-141.jpg',     pg_temp.ago(70),  pg_temp.ago(70)),
 (12, (SELECT id FROM demo_u WHERE k='sara'), 'Mi Smart Band 8',          'SKU XMI-MSB8-BLK · 1.62-inch AMOLED, 16-day battery, 150+ sports modes',                     2999, 'https://example.com/products/mi-smart-band-8.jpg',       pg_temp.ago(70),  pg_temp.ago(70));

-- ----------------------------------------------------------------- orders ----
-- Order lines first (order, product, quantity), so each order's total can be computed from them.
CREATE TEMP TABLE demo_lines (o INTEGER, p INTEGER, q INTEGER) ON COMMIT DROP;
INSERT INTO demo_lines VALUES
    (1,3,1), (2,1,1), (3,4,1), (3,8,1), (4,5,1), (5,7,1), (6,9,1), (6,10,1), (7,2,1), (8,6,1),
    (9,4,1), (10,3,2), (11,10,1), (12,1,1), (13,8,1), (13,9,1), (14,7,1), (15,5,1), (16,3,1), (17,2,1),
    (18,6,1), (19,9,1), (20,4,1), (20,10,1), (21,7,1), (22,1,1), (23,3,1), (24,8,1), (25,9,1),
    (26,11,2), (27,12,1),
    (28,3,1);   -- order 28: the guided demo's order (Alice, Sony WH-1000XM5, delivered, never returned)

INSERT INTO orders (id, customer_id, status, total_amount, created_at, updated_at)
SELECT v.id, (SELECT id FROM demo_u WHERE k = v.cust), v.status,
       (SELECT SUM(l.q * pr.price) FROM demo_lines l JOIN products pr ON pr.id = l.p WHERE l.o = v.id),
       pg_temp.ago(v.days), pg_temp.ago(GREATEST(v.days - 4, 0))
  FROM (VALUES
    (1,  'alice', 'DELIVERED', 70), (2,  'bob',   'DELIVERED', 68), (3,  'priya', 'DELIVERED', 66), (4,  'rohan', 'DELIVERED', 64),
    (5,  'alice', 'DELIVERED', 60), (6,  'bob',   'DELIVERED', 58), (7,  'priya', 'DELIVERED', 55), (8,  'rohan', 'DELIVERED', 52),
    (9,  'alice', 'DELIVERED', 50), (10, 'bob',   'DELIVERED', 47), (11, 'priya', 'DELIVERED', 45), (12, 'rohan', 'DELIVERED', 42),
    (13, 'alice', 'DELIVERED', 38), (14, 'bob',   'DELIVERED', 35), (15, 'priya', 'DELIVERED', 32), (16, 'rohan', 'DELIVERED', 28),
    (17, 'alice', 'DELIVERED', 24), (18, 'bob',   'DELIVERED', 20), (19, 'priya', 'DELIVERED', 15), (20, 'rohan', 'DELIVERED', 12),
    (21, 'alice', 'SHIPPED',    6), (22, 'bob',   'SHIPPED',    4), (23, 'priya', 'CONFIRMED',  2), (24, 'rohan', 'PENDING',    1),
    (25, 'alice', 'CANCELLED', 30),
    -- Sara's shop (orders 26, 27) is sold to Priya and Rohan only. The four public demo accounts (Alice, Sam, Pete, Wendy)
    -- must tell ONE story, so Alice never holds an order that belongs to another seller.
    (26, 'priya', 'DELIVERED', 33), (27, 'rohan', 'DELIVERED', 18),
    (28, 'alice', 'DELIVERED', 14)
  ) AS v(id, cust, status, days);

-- unit_price is a snapshot of the product price at purchase time
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
SELECT l.o, l.p, l.q, pr.price FROM demo_lines l JOIN products pr ON pr.id = l.p ORDER BY l.o, l.p;

-- --------------------------------------------------------- return requests ----
-- One row per story. status / timestamps are explained in the comment of each row.
INSERT INTO return_requests
    (id, customer_id, order_id, order_item_id, product_id, reason, description, customer_image_url, status, seller_decision_at, created_at, updated_at)
SELECT v.id, o.customer_id, o.id, oi.id, oi.product_id, v.reason, v.descr, v.img, v.status,
       CASE WHEN v.decided IS NULL THEN NULL ELSE pg_temp.ago(v.decided) END, pg_temp.ago(v.created), pg_temp.ago(v.updated)
  FROM (VALUES
    --  id  order product reason              description                                                                  image                                    status                 created decided updated
    -- A: whole lifecycle, refunded and closed
    (1,   1,  3, 'NOT_AS_DESCRIBED', 'Noise cancelling is much weaker than advertised on my commute.',                 NULL,                                    'COMPLETED',            61.0,  60.5,   55.0),
    (2,   2,  1, 'DAMAGED',          'Deep scratches on the back glass and frame out of the box.',                    'https://example.com/returns/r2.jpg',    'REFUNDED',             50.0,  49.5,   44.0),
    -- B: the seller said no
    (3,   3,  4, 'CHANGED_MIND',     'Bought the wrong generation, would like to return.',                            NULL,                                    'SELLER_REJECTED',      40.0,  39.0,   39.0),
    -- C: pickup stage (assigned / accepted / failed then reassigned)
    (5,   4,  5, 'DAMAGED',          'Laptop screen flickers and goes black after a few minutes.',                    'https://example.com/returns/r5.jpg',    'PICKUP_ASSIGNED',       3.0,   2.5,    2.0),
    (6,   13, 8, 'NOT_AS_DESCRIBED', 'The USB receiver was missing from the box.',                                    'https://example.com/returns/r6.jpg',    'PICKUP_ASSIGNED',       4.0,   3.5,    2.8),
    (7,   6,  9, 'DAMAGED',          'Left speaker is distorted at any volume.',                                      'https://example.com/returns/r7.jpg',    'PICKUP_ASSIGNED',       6.0,   5.5,    1.5),
    -- D: collected, on its way to / waiting at the warehouse
    (8,   7,  2, 'WRONG_ITEM',       'Received the 128 GB model, I ordered the 256 GB.',                              'https://example.com/returns/r8.jpg',    'PICKED_UP',             7.0,   6.5,    1.0),
    (9,   5,  7, 'SIZE_ISSUE',       'Sport band is too large for my wrist, need a smaller strap size.',              NULL,                                    'WAREHOUSE_RECEIVED',    9.0,   8.5,    5.5),
    -- E: inspection under way (AI raised a flag / human working on it)
    (10,  8,  6, 'WRONG_ITEM',       'The laptop is a different model from the one in the listing.',                  'https://example.com/returns/r10.jpg',   'INSPECTION',           11.0,  10.5,    7.0),
    (11,  11, 10,'DAMAGED',          'Display is cracked and a corner is dented.',                                    'https://example.com/returns/r11.jpg',   'INSPECTION',            9.0,   8.5,    4.0),
    -- F: inspection rejected
    (12,  14, 7, 'DAMAGED',          'Screen cracked on delivery.',                                                   'https://example.com/returns/r12.jpg',   'INSPECTION_REJECTED',  25.0,  24.5,   20.0),
    -- inspection approved, refund waiting
    (13,  16, 3, 'DAMAGED',          'Headband hinge snapped while adjusting it.',                                    'https://example.com/returns/r13.jpg',   'REFUND_PENDING',       18.0,  17.5,   13.0),
    -- waiting for the seller / approved, no pickup yet
    (14,  19, 9, 'DAMAGED',          'Bluetooth keeps disconnecting and the speaker rattles.',                        'https://example.com/returns/r14.jpg',   'SELLER_APPROVED',       2.2,   1.0,    1.0),
    (15,  15, 5, 'NOT_AS_DESCRIBED', 'Listing said 16 GB RAM but the laptop shows 8 GB.',                             NULL,                                    'RETURN_REQUESTED',      1.2,   NULL,   1.2),
    (16,  20, 4, 'DAMAGED',          'Left earbud produces no sound.',                                                'https://example.com/returns/r16.jpg',   'RETURN_REQUESTED',      0.5,   NULL,   0.5)
  ) AS v(id, ord, prod, reason, descr, img, status, created, decided, updated)
  JOIN order_items oi ON oi.order_id = v.ord AND oi.product_id = v.prod
  JOIN orders o ON o.id = oi.order_id;

-- ------------------------------------------------------- pickup assignments ----
-- All with Pete. PICKED_UP rows carry picked_up_at (a database rule); a FAILED row stays as history
-- when the pickup is reassigned.
INSERT INTO pickup_assignments (id, return_request_id, agent_id, status, assigned_at, picked_up_at, created_at, updated_at)
SELECT v.id, v.ret, (SELECT id FROM demo_u WHERE k = 'pete'), v.status, pg_temp.ago(v.assigned),
       CASE WHEN v.picked IS NULL THEN NULL ELSE pg_temp.ago(v.picked) END, pg_temp.ago(v.assigned), pg_temp.ago(v.updated)
  FROM (VALUES
    (1,  1,  'PICKED_UP', 60.0, 59.0, 59.0),
    (2,  2,  'PICKED_UP', 49.0, 48.0, 48.0),
    (3,  7,  'FAILED',     5.0, NULL, 4.5),   -- customer not reachable
    (4,  7,  'ASSIGNED',   1.5, NULL, 1.5),   -- reassigned
    (5,  5,  'ASSIGNED',   2.0, NULL, 2.0),
    (6,  6,  'ACCEPTED',   3.0, NULL, 2.8),
    (7,  8,  'PICKED_UP',  6.0, 1.0,  1.0),
    (8,  9,  'PICKED_UP',  8.0, 6.0,  6.0),
    (9,  10, 'PICKED_UP', 10.0, 8.5,  8.5),
    (10, 11, 'PICKED_UP',  8.0,  6.0,  6.0),
    (11, 12, 'PICKED_UP', 24.0, 23.0, 23.0),
    (12, 13, 'PICKED_UP', 17.0, 16.0, 16.0)
  ) AS v(id, ret, status, assigned, picked, updated);

-- ------------------------------------------------------------- inspections ----
-- All assigned to Wendy. The ai_* columns are advisory; status / condition / notes are the human's.
-- ai_result carries the fields the warehouse screen shows (productMatchScore, condition, summary).
INSERT INTO inspections
    (id, return_request_id, warehouse_staff_id, condition, ai_product_match, ai_damage_detected, ai_damage_type, ai_confidence, ai_result, notes, status, created_at, updated_at)
SELECT v.id, v.ret, (SELECT id FROM demo_u WHERE k = 'wendy'), v.cond, v.match, v.dmg, v.dtype, v.conf, v.ai::jsonb, v.notes, v.status, pg_temp.ago(v.created), pg_temp.ago(v.updated)
  FROM (VALUES
    -- clean return, AI and human agree, approved
    (1,  1,  'LIKE_NEW', TRUE,  FALSE, NULL,        0.950, '{"model":"demo-v1","productMatchScore":0.98,"condition":"Like new","summary":"Original packaging, no visible damage."}',
        'Sealed accessories, no wear. Return accepted.', 'APPROVED', 58.0, 57.5),
    -- scratch found by AI (flagged for manual review), human confirmed, approved
    (2,  2,  'DAMAGED',  TRUE,  TRUE,  'SCRATCH',   0.860, '{"model":"demo-v1","productMatchScore":0.97,"condition":"Damaged","summary":"Multiple scratches across the rear glass.","manualReview":true}',
        'Deep scratches on rear glass and frame, confirmed on inspection.', 'APPROVED', 47.0, 46.5),
    -- received, nothing done yet (AI has not run)
    (3,  9,  NULL,       NULL,  NULL,  NULL,        NULL,  NULL,                                                                                                              NULL,
        'PENDING', 5.5, 5.5),
    -- AI says it is not the listed model: waiting for a human decision
    (4,  10, NULL,       FALSE, FALSE, NULL,        0.910, '{"model":"demo-v1","productMatchScore":0.12,"condition":"Unknown","summary":"Chassis and keyboard layout do not match the listed IdeaPad Slim 5."}',
        NULL, 'MANUAL_REVIEW', 7.0, 7.0),
    -- warehouse staff has started, AI saw damage
    (5,  11, NULL,       TRUE,  TRUE,  'DENT',      0.740, '{"model":"demo-v1","productMatchScore":0.93,"condition":"Damaged","summary":"Dent on the lower corner, possible display crack."}',
        NULL, 'IN_PROGRESS', 4.0, 4.0),
    -- AI suspected damage with low confidence, human found none: rejected (the AI only advises)
    (6,  12, 'USED',     TRUE,  TRUE,  'SCRATCH',   0.620, '{"model":"demo-v1","productMatchScore":0.96,"condition":"Used","summary":"Light marks on the case, low confidence.","manualReview":true}',
        'Only light cosmetic marks from normal use. The reported cracked screen is not present.', 'REJECTED', 21.0, 20.0),
    -- structural damage confirmed, approved, refund still pending
    (7,  13, 'DAMAGED',  TRUE,  TRUE,  'STRUCTURAL',0.930, '{"model":"demo-v1","productMatchScore":0.95,"condition":"Damaged","summary":"Fractured headband hinge.","manualReview":true}',
        'Hinge broken, damage confirmed.', 'APPROVED', 14.0, 13.0)
  ) AS v(id, ret, cond, match, dmg, dtype, conf, ai, notes, status, created, updated);

-- ----------------------------------------------------------------- refunds ----
-- Only for APPROVED inspections. The amount is the order line (unit price x quantity), as the backend computes it.
INSERT INTO refunds (id, return_request_id, customer_id, amount, status, transaction_reference, processed_at, created_at, updated_at)
SELECT v.id, rr.id, rr.customer_id, oi.unit_price * oi.quantity, v.status, v.ref,
       CASE WHEN v.processed IS NULL THEN NULL ELSE pg_temp.ago(v.processed) END, pg_temp.ago(v.created), pg_temp.ago(COALESCE(v.processed, v.created))
  FROM (VALUES
    (1, 1,  'COMPLETED', 'TXN-RF-100001', 55.0, 57.5),
    (2, 2,  'COMPLETED', 'TXN-RF-100002', 44.0, 46.5),
    (3, 13, 'PENDING',   NULL,            NULL, 13.0)
  ) AS v(id, ret, status, ref, processed, created)
  JOIN return_requests rr ON rr.id = v.ret
  JOIN order_items oi ON oi.id = rr.order_item_id;

-- ------------------------------------------- keep id counters ahead of the rows ----
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['products', 'orders', 'return_requests', 'pickup_assignments', 'inspections', 'refunds'] LOOP
        EXECUTE format(
            $f$SELECT setval(pg_get_serial_sequence(%L, 'id'), GREATEST((SELECT MAX(id) FROM %I),
                   COALESCE((SELECT last_value FROM pg_sequences WHERE schemaname = 'public' AND sequencename = split_part(pg_get_serial_sequence(%L, 'id'), '.', 2)), 0)))$f$,
            t, t, t);
    END LOOP;
END $$;

COMMIT;
