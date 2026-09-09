-- Run after the bootstrap as the project administrator. Keep genz OUT of Data API exposed schemas.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='genz_app') THEN CREATE ROLE genz_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS; END IF;
END $$;
-- PostgreSQL 16+ distinguishes membership from permission to SET ROLE.
GRANT genz_app TO postgres WITH SET TRUE;
REVOKE ALL ON SCHEMA genz FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA genz FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA genz TO genz_app;
GRANT SELECT, INSERT, UPDATE ON genz.settings,genz.members,genz.records,genz.invites,genz.files TO genz_app;
GRANT SELECT, INSERT ON genz.audits TO genz_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON genz.rate_limits TO genz_app;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['settings','members','records','invites','files','audits','rate_limits'] LOOP
  EXECUTE format('ALTER TABLE genz.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE genz.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY genz_server_only ON genz.%I TO genz_app USING (true) WITH CHECK (true)',t);
 END LOOP;
END $$;
-- genz_app is server-only. Its privileges do not depend on user-editable JWT metadata.
-- Server routes authenticate verified Supabase users and enforce per-record permissions.
-- Provision genz_app LOGIN with a generated password through secure setup; never commit it.
