CREATE INDEX IF NOT EXISTS ci_history_quality_jobs ON public.ci_history_index(user_id,(coalesce('api:'||linked_conversation_id::text,'export:'||thread_key)),sent_at) WHERE direction='incoming' AND feedback_kind IN ('problem','desire','objection','question','testimonial') AND length(display_text)>=12;
CREATE OR REPLACE FUNCTION public.ci_claim_job() RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public SET jit=off AS $$
DECLARE j ci_jobs;s ci_settings;payload jsonb;h text;spent integer;
BEGIN
 SELECT q.* INTO j FROM ci_jobs q JOIN ci_settings settings ON settings.user_id=q.user_id
 WHERE settings.analysis_enabled AND settings.daily_limit>0 AND q.attempts<3
 AND (q.status IN ('pending','error') OR(q.status='processing' AND q.lease_until<now()))
 AND coalesce((SELECT calls FROM ci_usage u WHERE u.user_id=q.user_id AND u.day=(now() AT TIME ZONE 'UTC')::date),0)<settings.daily_limit
 AND (EXISTS(SELECT 1 FROM ci_history_index hi WHERE hi.user_id=q.user_id AND coalesce('api:'||hi.linked_conversation_id::text,'export:'||hi.thread_key)=q.customer_key AND hi.direction='incoming' AND hi.feedback_kind IN ('problem','desire','objection','question','testimonial') AND length(hi.display_text)>=12 AND hi.sent_at>=to_date(q.period||'-01','YYYY-MM-DD') AND hi.sent_at<to_date(q.period||'-01','YYYY-MM-DD')+interval '1 month' AND NOT EXISTS(SELECT 1 FROM automations a WHERE a.user_id=hi.user_id AND a.trigger_type='keyword' AND lower(trim(a.trigger_value))=lower(trim(hi.display_text))))
 OR EXISTS(SELECT 1 FROM messages m WHERE m.user_id=q.user_id AND 'api:'||m.conversation_id::text=q.customer_key AND m.is_from_instagram AND ci_feedback_kind(m.content) IN ('problem','desire','objection','question','testimonial') AND length(m.content)>=12 AND m.created_at>=to_date(q.period||'-01','YYYY-MM-DD') AND m.created_at<to_date(q.period||'-01','YYYY-MM-DD')+interval '1 month'))
 ORDER BY q.period DESC,q.updated_at DESC LIMIT 1 FOR UPDATE OF q SKIP LOCKED;
 IF NOT FOUND THEN RETURN NULL;END IF;
 SELECT * INTO s FROM ci_settings WHERE user_id=j.user_id FOR UPDATE;
 INSERT INTO ci_usage(user_id,day,calls) VALUES(j.user_id,(now() AT TIME ZONE 'UTC')::date,0) ON CONFLICT DO NOTHING;
 SELECT calls INTO spent FROM ci_usage WHERE user_id=j.user_id AND day=(now() AT TIME ZONE 'UTC')::date FOR UPDATE;
 IF spent>=s.daily_limit THEN RETURN NULL;END IF;
 SELECT jsonb_agg(row_to_json(e) ORDER BY occurred_at,event_key) INTO payload FROM (
 SELECT event_key,occurred_at,left(text,700) AS text FROM ci_messages WHERE user_id=j.user_id AND customer_key=j.customer_key
 AND kind='customer' AND quality_kind IN ('problem','desire','objection','question','testimonial') AND length(text)>=12 AND to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM')=j.period ORDER BY occurred_at DESC,event_key DESC LIMIT 8
 ) e;
 h=md5('quality-v2:'||coalesce(payload::text,'[]'));
 IF payload IS NULL OR(j.input_hash=h AND j.insight IS NOT NULL AND j.schema_version=2) THEN UPDATE ci_jobs SET status='ready',lease_until=NULL WHERE user_id=j.user_id AND customer_key=j.customer_key AND period=j.period;RETURN NULL;END IF;
 UPDATE ci_usage SET calls=calls+1 WHERE user_id=j.user_id AND day=(now() AT TIME ZONE 'UTC')::date;
 UPDATE ci_jobs SET status='processing',input_hash=h,attempts=attempts+1,lease_until=now()+interval '10 minutes' WHERE user_id=j.user_id AND customer_key=j.customer_key AND period=j.period;
 RETURN jsonb_build_object('user_id',j.user_id::text,'customer_key',j.customer_key,'period',j.period,'revision',j.revision,'input_hash',h,'messages',payload);
END$$;

CREATE OR REPLACE FUNCTION public.ci_queue_message() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE k text;ts timestamptz;txt text;
BEGIN
 IF TG_TABLE_NAME='messages' THEN
  IF NOT NEW.is_from_instagram THEN RETURN NEW;END IF;k='api:'||NEW.conversation_id::text;ts=NEW.created_at;txt=NEW.content;
 ELSE
  IF NEW.direction<>'incoming' THEN RETURN NEW;END IF;k=coalesce('api:'||NEW.linked_conversation_id::text,'export:'||NEW.thread_key);ts=NEW.sent_at;txt=NEW.display_text;
 END IF;
 IF length(txt)<12 OR txt LIKE 'ACT::%' OR ci_feedback_kind(txt) NOT IN ('problem','desire','objection','question','testimonial') THEN RETURN NEW;END IF;
 INSERT INTO ci_jobs(user_id,customer_key,period) VALUES(NEW.user_id,k,to_char(ts AT TIME ZONE 'UTC','YYYY-MM'))
 ON CONFLICT(user_id,customer_key,period) DO UPDATE SET status=CASE WHEN ci_jobs.status='processing' THEN 'processing' ELSE 'pending' END,revision=ci_jobs.revision+1,attempts=CASE WHEN ci_jobs.status='processing' THEN ci_jobs.attempts ELSE 0 END,updated_at=now();
 RETURN NEW;
END$$;
CREATE OR REPLACE FUNCTION public.ci_seed_jobs(p_owner bigint) RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE n bigint;BEGIN
 INSERT INTO ci_jobs(user_id,customer_key,period)
 SELECT p_owner,customer_key,to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM') FROM ci_messages
 WHERE user_id=p_owner AND kind='customer' AND quality_kind IN ('problem','desire','objection','question','testimonial') AND length(text)>=12 GROUP BY customer_key,to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM')
 ON CONFLICT DO NOTHING;GET DIAGNOSTICS n=ROW_COUNT;RETURN n;END$$;
