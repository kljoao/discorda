-- Execute as the migration administrator after PersistentChat on hosted PostgreSQL.
-- Does not grant any access to anon/authenticated or expose the schema via PostgREST.
GRANT SELECT, INSERT, UPDATE ON discorda.messages TO discorda_runtime;
GRANT USAGE, SELECT ON SEQUENCE discorda."messages_Id_seq" TO discorda_runtime;
