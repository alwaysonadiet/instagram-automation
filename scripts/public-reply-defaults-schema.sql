-- Apply before deploying the account-defaults API. Existing rules remain unchanged.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS public_reply_defaults jsonb;
