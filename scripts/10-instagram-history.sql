-- Additive staging layer: apply before deploying the Data page.
-- Export display names do not reliably identify scoped Instagram API IDs.
CREATE TABLE IF NOT EXISTS public.instagram_history_events (
  user_id bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source_key text NOT NULL,
  thread_key text NOT NULL,
  source_path text NOT NULL,
  sender_name text NOT NULL,
  participants jsonb NOT NULL,
  direction text NOT NULL CHECK (direction IN ('incoming', 'outgoing', 'unknown')),
  sent_at timestamptz NOT NULL,
  original_event jsonb NOT NULL,
  original_text text NOT NULL,
  display_text text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]',
  meta_message_id text,
  linked_conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, source_key)
);
CREATE INDEX IF NOT EXISTS history_user_thread_time ON public.instagram_history_events(user_id, thread_key, sent_at);
ALTER TABLE public.instagram_history_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.instagram_history_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.instagram_history_events TO service_role;
-- Intentionally no browser grants. Verified, owner-scoped server routes only.
