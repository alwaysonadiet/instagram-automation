-- Browser data access is read-only and scoped to a server-assigned Instagram identity.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname,tablename FROM pg_policies WHERE schemaname='public' AND tablename IN ('messages','conversations')
  LOOP EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename); END LOOP;
END $$;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.messages, public.conversations TO authenticated;
CREATE POLICY inbox_messages_read_own ON public.messages FOR SELECT TO authenticated
USING (user_id::text = (SELECT auth.jwt()->'app_metadata'->>'instagram_user_id'));
CREATE POLICY inbox_conversations_read_own ON public.conversations FOR SELECT TO authenticated
USING (user_id::text = (SELECT auth.jwt()->'app_metadata'->>'instagram_user_id'));
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;
