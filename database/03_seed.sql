-- =============================================================================
--  ISP-CRM Seed Data — for testing & development
-- =============================================================================

-- SuperAdmin and Agent/Subdealer accounts
INSERT INTO admins (username, email, hashed_password, full_name, role, wallet_balance, customer_limit) VALUES
('admin', 'admin@isp-crm.local',
 '$2b$12$nLeRGfojkkOTygCeR/62.OhawkwE6IR5D1TfSFul7HwWVZHH.Otf2',  -- fastx
 'System Administrator', 'SuperAdmin', 999999.00, NULL),
('ali', 'ali@isp-crm.local',
 '$2b$12$WHLPpzjjAi5aeqAXHJ20de5xgwCtD3WXyTLWGoEHS3zCHMxwy2JVe',  -- Ali
 'Ali Subdealer', 'Agent', 5000.00, 500);

-- ISP Zones
INSERT INTO isp_zones (zone_code, area_name, city) VALUES
('Z001', 'Downtown Business District', 'Lahore'),
('Z002', 'Model Town', 'Lahore'),
('Z003', 'DHA Phase 5', 'Lahore'),
('Z004', 'Gulberg III', 'Lahore'),
('Z005', 'Johar Town', 'Lahore');

-- Internet Profiles / Packages
INSERT INTO internet_profiles (name, download_speed, upload_speed, retail_price, wholesale_cost, validity_days, pppoe_pool) VALUES
('Starter 5MB',    5120,   2048,  800.00,  500.00, 30, 'pool_5mb'),
('Standard 10MB',  10240,  5120,  1200.00, 800.00, 30, 'pool_10mb'),
('Premium 20MB',   20480,  10240, 2000.00, 1400.00, 30, 'pool_20mb'),
('Business 50MB',  51200,  25600, 4500.00, 3000.00, 30, 'pool_50mb'),
('Enterprise 100MB',102400,51200, 8000.00, 5500.00, 30, 'pool_100mb');

-- NAS Router (dummy MikroTik)
INSERT INTO nas_routers (name, ip_address, api_port, api_user, encrypted_api_pass, nas_secret, location, zone_id) VALUES
('MikroTik-Main-Gateway', '192.168.88.1', 8729, 'admin',
 'ENCRYPTED_PLACEHOLDER_CHANGE_AFTER_AES_INIT',
 'testing123', 'Server Room - Ground Floor', 1);

-- FreeRADIUS NAS client table
INSERT INTO nas (nasname, shortname, type, secret, description) VALUES
('192.168.88.1', 'mikrotik-main', 'other', 'testing123', 'Main MikroTik Gateway');

-- OLT Device (dummy VSOL)
INSERT INTO olt_devices (name, ip_address, ssh_port, ssh_user, encrypted_pass, olt_type, snmp_community, location, zone_id) VALUES
('VSOL-OLT-01', '192.168.1.200', 22, 'admin',
 'ENCRYPTED_PLACEHOLDER_CHANGE_AFTER_AES_INIT',
 'VSOL', 'public', 'Fiber Hub - Zone 1', 1);

-- Test Subscriber (will trigger RADIUS provisioning)
INSERT INTO subscribers 
    (full_name, cnic, mobile, address, zone_id, nas_id, profile_id,
     pppoe_username, pppoe_password, expiration_date, status)
VALUES
    ('Test Subscriber One', '35201-1234567-1', '03001234567',
     'House 1, Street 2, Model Town, Lahore', 2, 1, 2,
     'testuser001', 'TestPass@123',
     CURRENT_DATE + INTERVAL '30 days', 'Active');

-- Verify radcheck was populated by trigger
-- SELECT * FROM radcheck WHERE username = 'testuser001';
-- Should show: Cleartext-Password, Simultaneous-Use

-- Ledger entry for the test subscriber
INSERT INTO financial_ledger (transaction_type, amount, subscriber_id, admin_id, profile_id, description, payment_method) 
SELECT 'Credit', 1200.00, s.id, a.id, 2, 'Initial activation payment - Standard 10MB', 'Cash'
FROM subscribers s, admins a
WHERE s.pppoe_username = 'testuser001' AND a.username = 'admin';

-- Test expired subscriber (should trigger Auth-Type := Reject)
INSERT INTO subscribers 
    (full_name, cnic, mobile, address, zone_id, nas_id, profile_id,
     pppoe_username, pppoe_password, expiration_date, status)
VALUES
    ('Expired Test User', '35201-9999999-9', '03009999999',
     'House 99, Test Street', 1, 1, 1,
     'expireduser001', 'ExpiredPass123',
     CURRENT_DATE - INTERVAL '5 days', 'Active');

-- Now expire the user — this triggers the RADIUS reject injection
UPDATE subscribers SET status = 'Expired' WHERE pppoe_username = 'expireduser001';

-- Recharge card batch sample
INSERT INTO recharge_cards (pin, face_value, batch_id, generated_by, expires_at)
SELECT 
    UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT), 1, 4) || '-' ||
          SUBSTRING(MD5(RANDOM()::TEXT), 1, 4) || '-' ||
          SUBSTRING(MD5(RANDOM()::TEXT), 1, 4) || '-' ||
          SUBSTRING(MD5(RANDOM()::TEXT), 1, 4)),
    1000.00,
    'BATCH-DEMO-001',
    (SELECT id FROM admins WHERE username = 'admin'),
    CURRENT_DATE + INTERVAL '6 months'
FROM generate_series(1, 10);

-- Confirmation queries (for verification)
DO $$
DECLARE
    sub_count     INTEGER;
    radius_count  INTEGER;
    reject_count  INTEGER;
BEGIN
    SELECT COUNT(*) INTO sub_count     FROM subscribers;
    SELECT COUNT(*) INTO radius_count  FROM radcheck WHERE username = 'testuser001';
    SELECT COUNT(*) INTO reject_count  FROM radcheck WHERE username = 'expireduser001' AND attribute = 'Auth-Type' AND value = 'Reject';

    RAISE NOTICE '=== SEED VERIFICATION ===';
    RAISE NOTICE 'Total subscribers   : %', sub_count;
    RAISE NOTICE 'radcheck for testuser001 : % rows (expect 2)', radius_count;
    RAISE NOTICE 'Reject for expireduser001: % rows (expect 1)', reject_count;
    RAISE NOTICE '=========================';
END;
$$;
