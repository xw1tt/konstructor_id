-- Этап 1, часть 1: компании, пользователи, вход, приглашения, тарифы, баланс, журнал действий.
CREATE TABLE tariffs (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  seat_month_kop bigint NOT NULL DEFAULT 0,
  ai_per_1k_kop bigint NOT NULL DEFAULT 0,
  reviewer_free boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenants (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  inn text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  seats integer NOT NULL DEFAULT 1 CHECK (seats >= 0),
  tariff_id uuid REFERENCES tariffs(id),
  credit_kop bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id),
  email text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'engineer', 'reviewer')),
  password_hash text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'owner') = (tenant_id IS NULL))
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  client text NOT NULL DEFAULT 'panel',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE invites (
  token_hash text PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id),
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'engineer', 'reviewer')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

CREATE TABLE ledger (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('topup', 'fee', 'ai', 'adjust')),
  amount_kop bigint NOT NULL,
  author_id uuid REFERENCES users(id),
  reason text NOT NULL DEFAULT '',
  day date,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ledger_tenant ON ledger(tenant_id, at);
-- Абонентская плата — одна операция на компанию и день.
CREATE UNIQUE INDEX ledger_fee_day ON ledger(tenant_id, day) WHERE kind = 'fee';

CREATE TABLE audit (
  id uuid PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES users(id),
  tenant_id uuid REFERENCES tenants(id),
  action text NOT NULL,
  target text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_at ON audit(at);
