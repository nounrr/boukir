-- Migration: Create generic audit logging (no app code changes required)
-- Date: 2025-09-03
-- Purpose: Capture every INSERT / UPDATE / DELETE on business tables into audit_logs
-- NOTE: This relies ONLY on database triggers. Your existing Node code does not need changes.
-- If later you want to add user/request context, you can SET custom GUCs (see notes below).

-- ============ SAFETY ============
-- Idempotent: objects created with  / OR REPLACE.
-- Rollback section at bottom (manual) should you need to remove.

BEGIN;

-- (Optional) separate schema for helper functions
CREATE SCHEMA  app;

-- Main audit table
CREATE TABLE  public.audit_logs (
    id           BIGSERIAL PRIMARY KEY,
    table_name   text        NOT NULL,
    operation    char(1)     NOT NULL CHECK (operation IN ('I','U','D')),
    changed_at   timestamptz NOT NULL DEFAULT now(),
    -- User / request context (nullable for now since we don't touch app code)
    user_id      text NULL,              -- can be filled later via set_config('app.user_id','...')
    request_id   text NULL,              -- set_config('app.request_id','uuid')
    db_role      text NULL DEFAULT current_user,
    -- Row primary key (or best-effort) as JSONB so we can filter easily
    pk           jsonb NULL,
    old_data     jsonb NULL,
    new_data     jsonb NULL
);

-- Helpful indexes
CREATE INDEX  audit_logs_table_changed_at_idx ON public.audit_logs(table_name, changed_at DESC);
CREATE INDEX  audit_logs_operation_idx ON public.audit_logs(operation);
CREATE INDEX  audit_logs_user_idx ON public.audit_logs(user_id);
CREATE INDEX  audit_logs_pk_gin_idx ON public.audit_logs USING gin (pk jsonb_path_ops);

-- Function to set context (OPTIONAL usage from app, no change required now)
CREATE OR REPLACE FUNCTION app.set_audit_context(p_user_id text, p_request_id text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.user_id', coalesce(p_user_id,''), true);
  PERFORM set_config('app.request_id', coalesce(p_request_id,''), true);
END;$$;

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION app.audit_trigger()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_user_id    text := nullif(current_setting('app.user_id', true),'');
  v_request_id text := nullif(current_setting('app.request_id', true),'');
  v_pk jsonb;
BEGIN
  -- Try to derive primary key columns dynamically (works only if table has a PK)
  WITH pkcols AS (
    SELECT a.attname
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
    WHERE i.indrelid = TG_RELID AND i.indisprimary
    ORDER BY a.attnum
  )
  SELECT jsonb_object_agg(pkcols.attname, to_jsonb( (CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END)::record #>> ARRAY[pkcols.attname] ))
  INTO v_pk
  FROM pkcols;

  IF v_pk IS NULL THEN
    -- Fallback: include first column(s) best-effort (avoid huge rows)
    v_pk := jsonb_build_object('table_oid', TG_RELID, 'surrogate_ctid', (CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END)::text);
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs(table_name, operation, user_id, request_id, pk, new_data)
    VALUES (TG_TABLE_NAME, 'I', v_user_id, v_request_id, v_pk, to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF to_jsonb(OLD) IS DISTINCT FROM to_jsonb(NEW) THEN
      INSERT INTO public.audit_logs(table_name, operation, user_id, request_id, pk, old_data, new_data)
      VALUES (TG_TABLE_NAME, 'U', v_user_id, v_request_id, v_pk, to_jsonb(OLD), to_jsonb(NEW));
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs(table_name, operation, user_id, request_id, pk, old_data)
    VALUES (TG_TABLE_NAME, 'D', v_user_id, v_request_id, v_pk, to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;$$;

-- Helper to (re)attach triggers to all existing tables except audit_logs
CREATE OR REPLACE FUNCTION app.refresh_audit_triggers()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE r record; v_sql text; BEGIN
  FOR r IN
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type='BASE TABLE'
      AND table_schema='public'
      AND table_name <> 'audit_logs'
  LOOP
    v_sql := format('DROP TRIGGER IF EXISTS audit_%I ON %I.%I;', r.table_name, r.table_schema, r.table_name);
    EXECUTE v_sql;
    v_sql := format('CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION app.audit_trigger();', r.table_name, r.table_schema, r.table_name);
    EXECUTE v_sql;
  END LOOP;
END;$$;

-- Initial attachment now
SELECT app.refresh_audit_triggers();

COMMIT;

-- ================= ROLLBACK (manual) =================
-- BEGIN;
-- SELECT app.refresh_audit_triggers(); -- (no effect, just placeholder)
-- DROP FUNCTION IF EXISTS app.audit_trigger();
-- DROP FUNCTION IF EXISTS app.refresh_audit_triggers();
-- DROP FUNCTION IF EXISTS app.set_audit_context(text,text);
-- DROP TABLE IF EXISTS public.audit_logs;
-- COMMIT;

-- ================= HOW TO USE (Optional) =============
-- In application (future): after obtaining a DB connection
-- SELECT app.set_audit_context('123','550e8400-e29b-41d4-a716-446655440000');
-- Then all subsequent DML in that session will record user/request.
-- To re-apply triggers after adding new tables:
-- SELECT app.refresh_audit_triggers();

-- ================= QUERIES ===========================
-- Last changes on a table
-- SELECT * FROM audit_logs WHERE table_name='boukir_products' ORDER BY changed_at DESC LIMIT 50;
-- Show diff fields (example for one row id=42)
-- SELECT jsonb_object_keys(old_data - new_data) FROM audit_logs WHERE id=42 AND operation='U';
