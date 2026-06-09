DO $$
DECLARE
  admin_id UUID;
  agent_id UUID;
  profile_id INTEGER;
  nas_id INTEGER;
  zone_id INTEGER;
  i INTEGER;
  uname TEXT;
  sub_id BIGINT;
  nas_ip INET;
  acct_id TEXT;
BEGIN
  SELECT id INTO admin_id FROM admins WHERE role = 'SuperAdmin' ORDER BY created_at LIMIT 1;
  SELECT id INTO agent_id FROM admins WHERE role IN ('Admin','Agent') ORDER BY created_at LIMIT 1;
  SELECT id INTO profile_id FROM internet_profiles WHERE is_active = true ORDER BY id LIMIT 1;
  SELECT id, ip_address INTO nas_id, nas_ip FROM nas_routers ORDER BY id LIMIT 1;
  SELECT id INTO zone_id FROM isp_zones WHERE is_active = true ORDER BY id LIMIT 1;

  IF admin_id IS NULL OR profile_id IS NULL THEN
    RAISE EXCEPTION 'Required seed base rows missing (admins/profiles).';
  END IF;

  IF zone_id IS NULL THEN
    INSERT INTO isp_zones (zone_code, area_name, city, is_active)
    VALUES ('ZB2', 'Batch2 Test Area', 'Lahore', true)
    RETURNING id INTO zone_id;
  END IF;

  IF nas_id IS NULL THEN
    INSERT INTO nas_routers (name, ip_address, api_port, api_user, encrypted_api_pass, nas_secret, zone_id, is_active)
    VALUES ('Batch2-NAS', '10.10.10.1', 8729, 'admin', 'placeholder', 'testing123', zone_id, true)
    RETURNING id, ip_address INTO nas_id, nas_ip;
  END IF;

  FOR i IN 1..10 LOOP
    uname := format('batch2_user_%s', lpad(i::TEXT, 3, '0'));

    INSERT INTO subscribers (
      full_name, mobile, cnic, zone_id, nas_id, profile_id,
      pppoe_username, pppoe_password, expiration_date, status, agent_id
    ) VALUES (
      format('Batch2 Dummy User %s', i),
      format('0300123%04s', i),
      format('35201-%s-%s', lpad(i::TEXT, 7, '0'), (i % 9) + 1),
      zone_id,
      nas_id,
      profile_id,
      uname,
      'DummyPass@123',
      CURRENT_DATE + ((i % 25) + 1),
      CASE
        WHEN i % 7 = 0 THEN 'Expired'::subscriber_status
        WHEN i % 9 = 0 THEN 'Disabled'::subscriber_status
        ELSE 'Active'::subscriber_status
      END,
      COALESCE(agent_id, admin_id)
    )
    ON CONFLICT (pppoe_username) DO NOTHING;

    SELECT id INTO sub_id FROM subscribers WHERE pppoe_username = uname;

    INSERT INTO financial_ledger (
      transaction_type, amount, subscriber_id, admin_id, profile_id, invoice_number, description, payment_method, date
    ) VALUES (
      'Debit',
      1000 + i * 25,
      sub_id,
      admin_id,
      profile_id,
      format('INV-B2-%s', lpad(i::TEXT, 4, '0')),
      format('Batch2 invoice seed %s', i),
      'Cash',
      CURRENT_DATE - (i % 10)
    )
    ON CONFLICT (invoice_number) DO NOTHING;

    INSERT INTO financial_ledger (
      transaction_type, amount, subscriber_id, admin_id, profile_id, invoice_number, description, payment_method, date
    ) VALUES (
      'Credit',
      200 + i * 5,
      sub_id,
      admin_id,
      profile_id,
      format('CR-B2-%s', lpad(i::TEXT, 4, '0')),
      format('Batch2 credit seed %s', i),
      'Wallet',
      CURRENT_DATE - (i % 12)
    )
    ON CONFLICT (invoice_number) DO NOTHING;

    acct_id := format('B2-%s', lpad(i::TEXT, 6, '0'));

    INSERT INTO radacct (
      acctsessionid, acctuniqueid, username, nasipaddress, acctstarttime,
      acctupdatetime, acctstoptime, acctsessiontime, acctinputoctets,
      acctoutputoctets, calledstationid, callingstationid, acctterminatecause
    ) VALUES (
      acct_id,
      md5(acct_id),
      uname,
      nas_ip,
      NOW() - ((i % 36) || ' hours')::INTERVAL,
      NOW(),
      CASE WHEN i % 4 = 0 THEN NOW() - ((i % 3) || ' hours')::INTERVAL ELSE NULL END,
      (i * 1200),
      (i * 75000000)::bigint,
      (i * 42000000)::bigint,
      'nas-port',
      format('AA-BB-CC-DD-EE-%s', lpad(to_hex(i), 2, '0')),
      CASE WHEN i % 4 = 0 THEN 'User-Request' ELSE '' END
    )
    ON CONFLICT (acctuniqueid) DO NOTHING;
  END LOOP;
END $$;

SELECT
  (SELECT COUNT(*) FROM subscribers WHERE pppoe_username LIKE 'batch2_user_%') AS batch2_subscribers,
  (SELECT COUNT(*) FROM financial_ledger WHERE invoice_number LIKE 'INV-B2-%') AS batch2_invoices,
  (SELECT COUNT(*) FROM radacct WHERE username LIKE 'batch2_user_%') AS batch2_radacct_rows,
  (SELECT COUNT(*) FROM radacct WHERE username LIKE 'batch2_user_%' AND acctstoptime IS NULL) AS batch2_online_sessions;
