ALTER TABLE public.ci_settings ADD COLUMN IF NOT EXISTS purchase_secret text NOT NULL DEFAULT(replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-',''));
ALTER TABLE public.ci_links ADD COLUMN IF NOT EXISTS owner_id text GENERATED ALWAYS AS(user_id::text) STORED;
