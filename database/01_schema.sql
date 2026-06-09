-- =============================================================================
--  ISP-CRM Master Database Schema
--  PostgreSQL 16 — Run via docker-entrypoint-initdb.d
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- =============================================================================
--  ENUM TYPES
-- =============================================================================
CREATE TYPE subscriber_status AS ENUM ('Active', 'Expired', 'Disabled', 'Suspended');
CREATE TYPE transaction_type  AS ENUM ('Debit', 'Credit', 'Adjustment', 'Refund');
CREATE TYPE admin_role        AS ENUM ('SuperAdmin', 'Admin', 'Agent', 'Viewer');
CREATE TYPE olt_type          AS ENUM ('VSOL', 'Huawei', 'ZTE', 'FiberHome', 'Other');
CREATE TYPE card_status       AS ENUM ('unused', 'redeemed', 'expired', 'voided');

-- =============================================================================
--  1. ADMINS
-- =============================================================================
CREATE TABLE admins (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username         VARCHAR(64)  UNIQUE NOT NULL,
    email            VARCHAR(255) UNIQUE NOT NULL,
    hashed_password  TEXT         NOT NULL,
    full_name        VARCHAR(128) NOT NULL,
    role             admin_role   NOT NULL DEFAULT 'Agent',
    permissions_json JSONB        NOT NULL DEFAULT '{}',
    wallet_balance   NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    customer_limit   INTEGER,
    is_active        BOOLEAN      NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================================
--  2. ISP ZONES
-- =============================================================================
CREATE TABLE isp_zones (
    id          SERIAL PRIMARY KEY,
    zone_code   VARCHAR(16)  UNIQUE NOT NULL,
    area_name   VARCHAR(128) NOT NULL,
    city        VARCHAR(64)  NOT NULL,
    description TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================================
--  3. NAS ROUTERS (MikroTik / Other)
-- =============================================================================
CREATE TABLE nas_routers (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(128) NOT NULL,
    ip_address          INET         NOT NULL,
    routeros_version    VARCHAR(32)  NOT NULL DEFAULT 'RouterOS v7',
    api_port            INTEGER      NOT NULL DEFAULT 8729,
    coa_port            INTEGER      NOT NULL DEFAULT 3799,
    api_user            VARCHAR(64)  NOT NULL,
    encrypted_api_pass  TEXT         NOT NULL,  -- AES-256-GCM encrypted
    nas_secret          TEXT         NOT NULL,  -- RADIUS shared secret
    location            VARCHAR(255),
    zone_id             INTEGER REFERENCES isp_zones(id) ON DELETE SET NULL,
    is_active           BOOLEAN      NOT NULL DEFAULT true,
    last_seen           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- FreeRADIUS NAS/Client table
CREATE TABLE nas (
    id           SERIAL PRIMARY KEY,
    nasname      VARCHAR(128) NOT NULL,
    shortname    VARCHAR(32),
    type         VARCHAR(30)  DEFAULT 'other',
    ports        INTEGER,
    secret       VARCHAR(60)  NOT NULL DEFAULT 'testing123',
    server       VARCHAR(64),
    community    VARCHAR(50),
    description  VARCHAR(200) DEFAULT 'RADIUS Client'
);
CREATE INDEX nas_nasname ON nas(nasname);

-- =============================================================================
--  4. OLT DEVICES
-- =============================================================================
CREATE TABLE olt_devices (
    id             SERIAL PRIMARY KEY,
    name           VARCHAR(128) NOT NULL,
    ip_address     INET         NOT NULL,
    ssh_port       INTEGER      NOT NULL DEFAULT 22,
    ssh_user       VARCHAR(64)  NOT NULL,
    encrypted_pass TEXT         NOT NULL,
    olt_type       olt_type     NOT NULL DEFAULT 'VSOL',
    snmp_community VARCHAR(64)  NOT NULL DEFAULT 'public',
    location       VARCHAR(255),
    zone_id        INTEGER REFERENCES isp_zones(id) ON DELETE SET NULL,
    is_active      BOOLEAN      NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================================
--  5. INTERNET PROFILES (Packages)
-- =============================================================================
CREATE TABLE internet_profiles (
    id              SERIAL PRIMARY KEY,
    name            VARCHAR(128) NOT NULL,
    download_speed  INTEGER      NOT NULL,  -- Kbps
    upload_speed    INTEGER      NOT NULL,  -- Kbps
    retail_price    NUMERIC(10,2) NOT NULL,
    wholesale_cost  NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    validity_days   INTEGER      NOT NULL DEFAULT 30,
    pppoe_pool      VARCHAR(64),            -- MikroTik pool name
    burst_limit_dl  INTEGER,               -- Kbps burst download
    burst_limit_ul  INTEGER,               -- Kbps burst upload
    description     TEXT,
    is_active       BOOLEAN      NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================================
--  6. SUBSCRIBERS — The Core CRM Entity
-- =============================================================================
CREATE TABLE subscribers (
    id               BIGSERIAL    PRIMARY KEY,
    full_name        VARCHAR(128) NOT NULL,
    cnic             VARCHAR(15)  UNIQUE,
    mobile           VARCHAR(15)  NOT NULL,
    alt_mobile       VARCHAR(15),
    email            VARCHAR(255),
    address          TEXT,
    zone_id          INTEGER      REFERENCES isp_zones(id) ON DELETE SET NULL,
    nas_id           INTEGER      REFERENCES nas_routers(id) ON DELETE SET NULL,
    olt_id           INTEGER      REFERENCES olt_devices(id) ON DELETE SET NULL,
    profile_id       INTEGER      NOT NULL REFERENCES internet_profiles(id) ON DELETE RESTRICT,
    pppoe_username   VARCHAR(64)  UNIQUE NOT NULL,
    pppoe_password   TEXT         NOT NULL,   -- stored hashed
    static_ip        INET,
    mac_address      MACADDR,
    onu_serial       VARCHAR(32),
    onu_port         VARCHAR(16),
    expiration_date  DATE         NOT NULL,
    status           subscriber_status NOT NULL DEFAULT 'Active',
    agent_id         UUID REFERENCES admins(id) ON DELETE SET NULL,
    notes            TEXT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscribers_status ON subscribers(status);
CREATE INDEX idx_subscribers_expiry ON subscribers(expiration_date);
CREATE INDEX idx_subscribers_zone   ON subscribers(zone_id);
CREATE INDEX idx_subscribers_pppoe  ON subscribers(pppoe_username);

-- =============================================================================
--  7. FINANCIAL LEDGER
-- =============================================================================
CREATE TABLE financial_ledger (
    id               BIGSERIAL    PRIMARY KEY,
    transaction_type transaction_type NOT NULL,
    amount           NUMERIC(12,2) NOT NULL,
    subscriber_id    BIGINT        REFERENCES subscribers(id) ON DELETE SET NULL,
    admin_id         UUID          REFERENCES admins(id) ON DELETE SET NULL,
    profile_id       INTEGER       REFERENCES internet_profiles(id) ON DELETE SET NULL,
    invoice_number   VARCHAR(32)   UNIQUE,
    date             DATE          NOT NULL DEFAULT CURRENT_DATE,
    description      TEXT          NOT NULL,
    reference_id     VARCHAR(64),
    payment_method   VARCHAR(32),
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_date          ON financial_ledger(date DESC);
CREATE INDEX idx_ledger_subscriber    ON financial_ledger(subscriber_id);
CREATE INDEX idx_ledger_type          ON financial_ledger(transaction_type);

-- =============================================================================
--  7B. OFFICE EXPENSES
-- =============================================================================
CREATE TABLE office_expenses (
    id             BIGSERIAL    PRIMARY KEY,
    expense_date   DATE         NOT NULL DEFAULT CURRENT_DATE,
    category       VARCHAR(64)  NOT NULL,
    amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    description    TEXT         NOT NULL,
    vendor         VARCHAR(128),
    payment_method VARCHAR(32),
    reference_no   VARCHAR(64),
    created_by     UUID         REFERENCES admins(id) ON DELETE SET NULL,
    updated_by     UUID         REFERENCES admins(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_office_expenses_date     ON office_expenses(expense_date DESC);
CREATE INDEX idx_office_expenses_category ON office_expenses(category);

-- =============================================================================
--  8. RECHARGE CARDS
-- =============================================================================
CREATE TABLE recharge_cards (
    id           BIGSERIAL   PRIMARY KEY,
    pin          VARCHAR(16) UNIQUE NOT NULL,
    face_value   NUMERIC(10,2) NOT NULL,
    status       card_status NOT NULL DEFAULT 'unused',
    generated_by UUID        REFERENCES admins(id) ON DELETE SET NULL,
    redeemed_by  UUID        REFERENCES admins(id) ON DELETE SET NULL,
    redeemed_at  TIMESTAMPTZ,
    batch_id     VARCHAR(32),
    expires_at   DATE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cards_status ON recharge_cards(status);
CREATE INDEX idx_cards_batch  ON recharge_cards(batch_id);

-- =============================================================================
--  FREERADIUS STANDARD TABLES
-- =============================================================================

-- radcheck — per-user check attributes (Auth-Type, User-Password, etc.)
CREATE TABLE radcheck (
    id         BIGSERIAL    PRIMARY KEY,
    username   VARCHAR(64)  NOT NULL DEFAULT '',
    attribute  VARCHAR(64)  NOT NULL DEFAULT '',
    op         VARCHAR(2)   NOT NULL DEFAULT ':=',
    value      VARCHAR(253) NOT NULL DEFAULT ''
);
CREATE INDEX radcheck_username ON radcheck(username, attribute);

-- radreply — per-user reply attributes (Framed-IP-Address, Rate-Limit, etc.)
CREATE TABLE radreply (
    id         BIGSERIAL    PRIMARY KEY,
    username   VARCHAR(64)  NOT NULL DEFAULT '',
    attribute  VARCHAR(64)  NOT NULL DEFAULT '',
    op         VARCHAR(2)   NOT NULL DEFAULT '=',
    value      VARCHAR(253) NOT NULL DEFAULT ''
);
CREATE INDEX radreply_username ON radreply(username, attribute);

-- radgroupcheck
CREATE TABLE radgroupcheck (
    id         BIGSERIAL    PRIMARY KEY,
    groupname  VARCHAR(64)  NOT NULL DEFAULT '',
    attribute  VARCHAR(64)  NOT NULL DEFAULT '',
    op         VARCHAR(2)   NOT NULL DEFAULT ':=',
    value      VARCHAR(253) NOT NULL DEFAULT ''
);
CREATE INDEX radgroupcheck_groupname ON radgroupcheck(groupname, attribute);

-- radgroupreply
CREATE TABLE radgroupreply (
    id         BIGSERIAL    PRIMARY KEY,
    groupname  VARCHAR(64)  NOT NULL DEFAULT '',
    attribute  VARCHAR(64)  NOT NULL DEFAULT '',
    op         VARCHAR(2)   NOT NULL DEFAULT '=',
    value      VARCHAR(253) NOT NULL DEFAULT ''
);
CREATE INDEX radgroupreply_groupname ON radgroupreply(groupname, attribute);

-- radusergroup — maps users to groups
CREATE TABLE radusergroup (
    username   VARCHAR(64)  NOT NULL DEFAULT '',
    groupname  VARCHAR(64)  NOT NULL DEFAULT '',
    priority   INTEGER      NOT NULL DEFAULT 1,
    PRIMARY KEY (username, groupname)
);

-- radacct — accounting records (sessions)
CREATE TABLE radacct (
    radacctid            BIGSERIAL    PRIMARY KEY,
    acctsessionid        VARCHAR(64)  NOT NULL DEFAULT '',
    acctuniqueid         VARCHAR(32)  NOT NULL DEFAULT '' UNIQUE,
    username             VARCHAR(64)  NOT NULL DEFAULT '',
    realm                VARCHAR(64),
    nasipaddress         INET         NOT NULL,
    nasportid            VARCHAR(15),
    nasporttype          VARCHAR(32),
    acctstarttime        TIMESTAMPTZ,
    acctupdatetime       TIMESTAMPTZ,
    acctstoptime         TIMESTAMPTZ,
    acctinterval         INTEGER,
    acctsessiontime      BIGINT,
    acctauthentic        VARCHAR(32),
    connectinfo_start    VARCHAR(50),
    connectinfo_stop     VARCHAR(50),
    acctinputoctets      BIGINT,
    acctoutputoctets     BIGINT,
    calledstationid      VARCHAR(50)  NOT NULL DEFAULT '',
    callingstationid     VARCHAR(50)  NOT NULL DEFAULT '',
    acctterminatecause   VARCHAR(32)  NOT NULL DEFAULT '',
    servicetype          VARCHAR(32),
    framedprotocol       VARCHAR(32),
    framedipaddress      INET,
    acctstartdelay       INTEGER,
    acctdelay            INTEGER,
    xascendsessionsvrkey VARCHAR(10)
);
CREATE INDEX radacct_active_session  ON radacct(acctstoptime)  WHERE acctstoptime IS NULL;
CREATE INDEX radacct_username        ON radacct(username);
CREATE INDEX radacct_nasipaddress    ON radacct(nasipaddress);
CREATE INDEX radacct_starttime       ON radacct(acctstarttime);

-- radpostauth — authentication audit log
CREATE TABLE radpostauth (
    id                BIGSERIAL    PRIMARY KEY,
    username          VARCHAR(64)  NOT NULL DEFAULT '',
    pass              VARCHAR(64)  NOT NULL DEFAULT '',
    reply             VARCHAR(32)  NOT NULL DEFAULT '',
    calledstationid   VARCHAR(50)  NOT NULL DEFAULT '',
    callingstationid  VARCHAR(50)  NOT NULL DEFAULT '',
    authdate          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX radpostauth_username ON radpostauth(username);

-- =============================================================================
--  WhatsApp Campaign Log
-- =============================================================================
CREATE TABLE whatsapp_logs (
    id             BIGSERIAL    PRIMARY KEY,
    subscriber_id  BIGINT       REFERENCES subscribers(id) ON DELETE CASCADE,
    phone          VARCHAR(15)  NOT NULL,
    message_type   VARCHAR(32)  NOT NULL,  -- 'welcome', 'expiry_3d', 'expiry_1d', 'payment', 'bulk'
    status         VARCHAR(16)  NOT NULL DEFAULT 'queued',  -- queued, sent, failed
    wa_message_id  VARCHAR(64),
    sent_at        TIMESTAMPTZ,
    error_message  TEXT,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- =============================================================================
--  Admin audit trail
-- =============================================================================
CREATE TABLE audit_log (
    id           BIGSERIAL    PRIMARY KEY,
    admin_id     UUID         REFERENCES admins(id) ON DELETE SET NULL,
    action       VARCHAR(64)  NOT NULL,
    entity_type  VARCHAR(32)  NOT NULL,
    entity_id    VARCHAR(64),
    old_values   JSONB,
    new_values   JSONB,
    ip_address   INET,
    user_agent   TEXT,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_admin ON audit_log(admin_id);
CREATE INDEX idx_audit_date  ON audit_log(created_at DESC);

-- Function to auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- Apply updated_at triggers
CREATE TRIGGER trg_admins_updated_at        BEFORE UPDATE ON admins           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_nas_routers_updated_at   BEFORE UPDATE ON nas_routers      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_olt_devices_updated_at   BEFORE UPDATE ON olt_devices      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_profiles_updated_at      BEFORE UPDATE ON internet_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_subscribers_updated_at   BEFORE UPDATE ON subscribers       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
