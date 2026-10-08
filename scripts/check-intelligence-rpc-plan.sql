-- Run with service_role and set ci.test_owner to the test account's numeric ID.
-- Reproduce the JSON argument binding used by PostgREST, rather than a literal call.
SET statement_timeout='6s';
PREPARE ci_dashboard_rpc(json) AS
WITH pgrst_source AS (
 SELECT pgrst_call.pgrst_scalar FROM (SELECT $1 AS json_data) pgrst_payload,
 LATERAL (SELECT p_owner,p_product,p_days,p_scope FROM json_to_record(pgrst_payload.json_data)
 AS _(p_owner bigint,p_product text,p_days integer,p_scope text) LIMIT 1) pgrst_body,
 LATERAL (SELECT public.ci_dashboard_v2(p_owner:=pgrst_body.p_owner,p_product:=pgrst_body.p_product,p_days:=pgrst_body.p_days,p_scope:=pgrst_body.p_scope) pgrst_scalar) pgrst_call
)
SELECT coalesce(json_agg(t.pgrst_scalar)->0,'null') FROM pgrst_source t;
EXPLAIN(ANALYZE,BUFFERS) EXECUTE ci_dashboard_rpc(json_build_object('p_owner',current_setting('ci.test_owner'),'p_product',NULL,'p_days',0,'p_scope','marketing'));
DEALLOCATE ci_dashboard_rpc;
