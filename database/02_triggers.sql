-- =============================================================================
--  ISP-CRM Database Triggers
--  Implements the Subscriber → FreeRADIUS synchronization logic
-- =============================================================================

-- =============================================================================
--  TRIGGER 1: On new Subscriber INSERT → populate radcheck + radreply
--  This provisions the FreeRADIUS record when a subscriber is created.
-- =============================================================================
CREATE OR REPLACE FUNCTION sync_subscriber_to_radius()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_profile internet_profiles%ROWTYPE;
    v_dl_rate TEXT;
    v_ul_rate TEXT;
BEGIN
    -- Fetch the subscriber's internet profile
    SELECT * INTO v_profile FROM internet_profiles WHERE id = NEW.profile_id;

    -- Format rates for MikroTik-style RADIUS rate-limit
    v_dl_rate := (v_profile.download_speed / 1000)::TEXT || 'M';
    v_ul_rate  := (v_profile.upload_speed  / 1000)::TEXT || 'M';

    IF TG_OP = 'INSERT' THEN
        -- Clear any existing records for this username (safety)
        DELETE FROM radcheck WHERE username = NEW.pppoe_username;
        DELETE FROM radreply  WHERE username = NEW.pppoe_username;
        DELETE FROM radusergroup WHERE username = NEW.pppoe_username;

        -- Insert cleartext password for PPPoE (PAP/CHAP)
        INSERT INTO radcheck (username, attribute, op, value)
        VALUES (NEW.pppoe_username, 'Cleartext-Password', ':=', NEW.pppoe_password);

        -- Set Simultaneous-Use limit (1 session per subscriber)
        INSERT INTO radcheck (username, attribute, op, value)
        VALUES (NEW.pppoe_username, 'Simultaneous-Use', ':=', '1');

        -- Rate limit reply attribute (MikroTik format: "rx_rate/tx_rate")
        INSERT INTO radreply (username, attribute, op, value)
        VALUES (NEW.pppoe_username, 'Mikrotik-Rate-Limit', '=', v_ul_rate || '/' || v_dl_rate);

        -- Session-Timeout (seconds until forced re-auth)
        INSERT INTO radreply (username, attribute, op, value)
        VALUES (NEW.pppoe_username, 'Session-Timeout', '=', '86400');

        -- Framed-Protocol = PPP
        INSERT INTO radreply (username, attribute, op, value)
        VALUES (NEW.pppoe_username, 'Framed-Protocol', '=', 'PPP');

        -- Assign to group matching profile
        INSERT INTO radusergroup (username, groupname, priority)
        VALUES (NEW.pppoe_username, 'plan_' || v_profile.id::TEXT, 1);

    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_subscriber_radius_insert
AFTER INSERT ON subscribers
FOR EACH ROW EXECUTE FUNCTION sync_subscriber_to_radius();

-- =============================================================================
--  TRIGGER 2: On Subscriber UPDATE → sync status changes to radcheck
--  When status → 'Expired' or 'Disabled': inject Auth-Type := Reject
--  When status → 'Active': remove Reject, restore password
-- =============================================================================
CREATE OR REPLACE FUNCTION sync_subscriber_status_to_radius()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    -- Only act if status has changed
    IF OLD.status = NEW.status AND OLD.pppoe_password = NEW.pppoe_password 
       AND OLD.profile_id = NEW.profile_id THEN
        RETURN NEW;
    END IF;

    IF NEW.status IN ('Expired', 'Disabled', 'Suspended') THEN
        -- Remove existing Auth-Type entries
        DELETE FROM radcheck 
        WHERE username = NEW.pppoe_username AND attribute = 'Auth-Type';
        
        -- Remove existing Cleartext-Password (so they cannot auth at all)
        DELETE FROM radcheck 
        WHERE username = NEW.pppoe_username AND attribute = 'Cleartext-Password';

        -- Inject hard reject
        INSERT INTO radcheck (username, attribute, op, value)
        VALUES (NEW.pppoe_username, 'Auth-Type', ':=', 'Reject')
        ON CONFLICT DO NOTHING;

        -- Log the disconnection event
        INSERT INTO audit_log (action, entity_type, entity_id, new_values)
        VALUES ('RADIUS_REJECT_INJECTED', 'subscriber', NEW.id::TEXT, 
                jsonb_build_object('status', NEW.status, 'pppoe_username', NEW.pppoe_username));

    ELSIF NEW.status = 'Active' THEN
        -- Remove any Reject attribute
        DELETE FROM radcheck 
        WHERE username = NEW.pppoe_username AND attribute = 'Auth-Type';

        -- Restore cleartext password
        DELETE FROM radcheck 
        WHERE username = NEW.pppoe_username AND attribute = 'Cleartext-Password';

        INSERT INTO radcheck (username, attribute, op, value)
        VALUES (NEW.pppoe_username, 'Cleartext-Password', ':=', NEW.pppoe_password);

        -- Update rate limit if profile changed
        IF OLD.profile_id != NEW.profile_id THEN
            DECLARE
                v_profile internet_profiles%ROWTYPE;
                v_dl_rate TEXT;
                v_ul_rate TEXT;
            BEGIN
                SELECT * INTO v_profile FROM internet_profiles WHERE id = NEW.profile_id;
                v_dl_rate := (v_profile.download_speed / 1000)::TEXT || 'M';
                v_ul_rate  := (v_profile.upload_speed  / 1000)::TEXT || 'M';

                UPDATE radreply 
                SET value = v_ul_rate || '/' || v_dl_rate
                WHERE username = NEW.pppoe_username AND attribute = 'Mikrotik-Rate-Limit';
            END;
        END IF;

        INSERT INTO audit_log (action, entity_type, entity_id, new_values)
        VALUES ('RADIUS_ACCESS_RESTORED', 'subscriber', NEW.id::TEXT,
                jsonb_build_object('status', NEW.status, 'pppoe_username', NEW.pppoe_username));
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_subscriber_status_radius
AFTER UPDATE ON subscribers
FOR EACH ROW EXECUTE FUNCTION sync_subscriber_status_to_radius();

-- =============================================================================
--  TRIGGER 3: Subscriber DELETE → clean up all RADIUS records
-- =============================================================================
CREATE OR REPLACE FUNCTION cleanup_radius_on_delete()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM radcheck     WHERE username = OLD.pppoe_username;
    DELETE FROM radreply     WHERE username = OLD.pppoe_username;
    DELETE FROM radusergroup WHERE username = OLD.pppoe_username;
    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_subscriber_radius_delete
AFTER DELETE ON subscribers
FOR EACH ROW EXECUTE FUNCTION cleanup_radius_on_delete();

-- =============================================================================
--  TRIGGER 4: Auto-generate invoice number for financial_ledger
-- =============================================================================
CREATE SEQUENCE invoice_seq START 10001;

CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.invoice_number IS NULL THEN
        NEW.invoice_number := 'INV-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(NEXTVAL('invoice_seq')::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ledger_invoice_number
BEFORE INSERT ON financial_ledger
FOR EACH ROW EXECUTE FUNCTION generate_invoice_number();

-- =============================================================================
--  TRIGGER 5: Admin wallet balance debit on subscriber renewal
-- =============================================================================
CREATE OR REPLACE FUNCTION debit_agent_wallet_on_renewal()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    v_cost NUMERIC(12,2);
BEGIN
    -- Only for Debit transactions linked to a subscriber renewal
    IF NEW.transaction_type = 'Debit' AND NEW.admin_id IS NOT NULL AND NEW.profile_id IS NOT NULL THEN
        SELECT wholesale_cost INTO v_cost 
        FROM internet_profiles WHERE id = NEW.profile_id;
        
        UPDATE admins 
        SET wallet_balance = wallet_balance - v_cost
        WHERE id = NEW.admin_id AND role = 'Agent';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_agent_wallet_debit
AFTER INSERT ON financial_ledger
FOR EACH ROW EXECUTE FUNCTION debit_agent_wallet_on_renewal();
