-- =============================================================================
--  ISP-CRM Demo Subscribers Seed (10 records)
--  Safe to run multiple times (idempotent by PPPoE username)
-- =============================================================================

WITH base AS (
  SELECT
    (SELECT id FROM isp_zones ORDER BY id LIMIT 1) AS zone1,
    (SELECT id FROM isp_zones ORDER BY id OFFSET 1 LIMIT 1) AS zone2,
    (SELECT id FROM isp_zones ORDER BY id OFFSET 2 LIMIT 1) AS zone3,
    (SELECT id FROM nas_routers ORDER BY id LIMIT 1) AS nas1,
    (SELECT id FROM admins WHERE username = 'agent_demo' LIMIT 1) AS agent1,
    (SELECT id FROM admins WHERE username = 'agent_north' LIMIT 1) AS agent2,
    (SELECT id FROM admins WHERE username = 'superadmin' LIMIT 1) AS admin_super,
    (SELECT id FROM internet_profiles WHERE name = 'Lite 8MB' LIMIT 1) AS p1,
    (SELECT id FROM internet_profiles WHERE name = 'Standard 10MB' LIMIT 1) AS p2,
    (SELECT id FROM internet_profiles WHERE name = 'Premium 20MB' LIMIT 1) AS p3,
    (SELECT id FROM internet_profiles WHERE name = 'Pro 30MB' LIMIT 1) AS p4,
    (SELECT id FROM internet_profiles WHERE name = 'Business 50MB' LIMIT 1) AS p5,
    (SELECT id FROM internet_profiles WHERE name = 'Ultra 60MB' LIMIT 1) AS p6
),
payload AS (
  SELECT * FROM (
    SELECT 'Ali Raza'::VARCHAR(128),       '35201-2222201-1'::VARCHAR(15), '03000012001'::VARCHAR(15), 'ali@demo.local'::VARCHAR(255),     'Block A, Model Town'::TEXT,  zone2, nas1, p1, 'ali_raza01'::VARCHAR(64),     'Ali@12345'::TEXT,    CURRENT_DATE + INTERVAL '30 days', 'Active'::subscriber_status,  agent1, 'Demo seeded user'::TEXT FROM base
    UNION ALL
    SELECT 'Sara Khan',                    '35201-2222202-2',              '03000012002',              'sara@demo.local',                 'Block B, Model Town',        zone2, nas1, p2, 'sara_khan02',                 'Sara@12345',         CURRENT_DATE + INTERVAL '25 days', 'Active'::subscriber_status,  agent1, 'Demo seeded user' FROM base
    UNION ALL
    SELECT 'Usman Tariq',                  '35201-2222203-3',              '03000012003',              'usman@demo.local',                'DHA Phase 5',               zone3, nas1, p3, 'usman_tariq03',               'Usman@12345',        CURRENT_DATE + INTERVAL '18 days', 'Active'::subscriber_status,  agent2, 'Demo seeded user' FROM base
    UNION ALL
    SELECT 'Nida Fatima',                  '35201-2222204-4',              '03000012004',              'nida@demo.local',                 'DHA Sector C',              zone3, nas1, p4, 'nida_fatima04',               'Nida@12345',         CURRENT_DATE + INTERVAL '12 days', 'Active'::subscriber_status,  agent2, 'Demo seeded user' FROM base
    UNION ALL
    SELECT 'Hamza Yousaf',                 '35201-2222205-5',              '03000012005',              'hamza@demo.local',                'Gulberg III',               zone1, nas1, p5, 'hamza_yousaf05',              'Hamza@12345',        CURRENT_DATE + INTERVAL '7 days',  'Active'::subscriber_status,  agent2, 'Demo seeded user' FROM base
    UNION ALL
    SELECT 'Ayesha Noor',                  '35201-2222206-6',              '03000012006',              'ayesha@demo.local',               'Johar Town',                zone1, nas1, p6, 'ayesha_noor06',               'Ayesha@12345',       CURRENT_DATE + INTERVAL '45 days', 'Active'::subscriber_status,  agent1, 'Demo seeded user' FROM base
    UNION ALL
    SELECT 'Bilal Ahmed',                  '35201-2222207-7',              '03000012007',              'bilal@demo.local',                'Johar Town Block 2',        zone1, nas1, p2, 'bilal_ahmed07',               'Bilal@12345',        CURRENT_DATE + INTERVAL '3 days',  'Active'::subscriber_status,  agent1, 'Demo seeded user' FROM base
    UNION ALL
    SELECT 'Mariam Iqbal',                 '35201-2222208-8',              '03000012008',              'mariam@demo.local',               'Model Town Extension',      zone2, nas1, p3, 'mariam_iqbal08',              'Mariam@12345',       CURRENT_DATE - INTERVAL '2 days',  'Expired'::subscriber_status, agent1, 'Demo seeded user' FROM base
    UNION ALL
    SELECT 'Farhan Malik',                 '35201-2222209-9',              '03000012009',              'farhan@demo.local',               'Gulberg Main',              zone1, nas1, p4, 'farhan_malik09',              'Farhan@12345',       CURRENT_DATE + INTERVAL '60 days', 'Active'::subscriber_status,  agent2, 'Demo seeded user' FROM base
    UNION ALL
    SELECT 'Hira Saeed',                   '35201-2222210-0',              '03000012010',              'hira@demo.local',                 'DHA Sector F',              zone3, nas1, p1, 'hira_saeed10',                'Hira@12345',         CURRENT_DATE + INTERVAL '15 days', 'Active'::subscriber_status,  agent2, 'Demo seeded user' FROM base
  ) s(
    full_name, cnic, mobile, email, address, zone_id, nas_id, profile_id,
    pppoe_username, pppoe_password, expiration_date, status, agent_id, notes
  )
),
ins AS (
  INSERT INTO subscribers (
    full_name, cnic, mobile, email, address, zone_id, nas_id, profile_id,
    pppoe_username, pppoe_password, expiration_date, status, agent_id, notes
  )
  SELECT
    full_name, cnic, mobile, email, address, zone_id, nas_id, profile_id,
    pppoe_username, pppoe_password, expiration_date, status, agent_id, notes
  FROM payload p
  WHERE NOT EXISTS (
    SELECT 1 FROM subscribers s WHERE s.pppoe_username = p.pppoe_username
  )
  RETURNING id, profile_id
)
INSERT INTO financial_ledger (transaction_type, amount, subscriber_id, admin_id, profile_id, description, payment_method)
SELECT
  'Credit',
  prof.retail_price,
  ins.id,
  b.admin_super,
  ins.profile_id,
  'Demo subscriber activation',
  'Cash'
FROM ins
JOIN internet_profiles prof ON prof.id = ins.profile_id
CROSS JOIN base b;
