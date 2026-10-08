-- Read-only. Run with PGOPTIONS='-c default_transaction_read_only=on'.
SELECT jsonb_build_object(
  'database', current_database(), 'server_version', current_setting('server_version'),
  'read_only', current_setting('default_transaction_read_only'),
  'columns', (SELECT jsonb_agg(to_jsonb(c) ORDER BY table_name, ordinal_position)
    FROM information_schema.columns c WHERE table_schema = 'public'),
  'constraints', (SELECT jsonb_agg(jsonb_build_object('table', rel.relname, 'name', con.conname,
    'type', con.contype, 'definition', pg_get_constraintdef(con.oid)) ORDER BY rel.relname, con.conname)
    FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace WHERE ns.nspname = 'public'),
  'triggers', (SELECT jsonb_agg(jsonb_build_object('table', rel.relname, 'definition', pg_get_triggerdef(t.oid),
    'function', pg_get_functiondef(t.tgfoid))) FROM pg_trigger t JOIN pg_class rel ON rel.oid=t.tgrelid
    JOIN pg_namespace ns ON ns.oid=rel.relnamespace WHERE ns.nspname='public' AND NOT t.tgisinternal),
  'lands', (SELECT jsonb_agg(jsonb_build_object('slug',l.slug,'status',l.status,'zoning',l.zoning,
    'verification_status',l.verification_status,'deleted',l.deleted_at IS NOT NULL,
    'zoning_info',to_jsonb(l)->'zoning_info') ORDER BY l.slug) FROM public.lands l),
  'submissions', (SELECT jsonb_agg(jsonb_build_object('status',s.status,'verification_status',s.verification_status,
    'zoning_info_present',to_jsonb(s)->'zoning_info' IS NOT NULL)) FROM public.property_submissions s)
) AS zoning_preflight;
