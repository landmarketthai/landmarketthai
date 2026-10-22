BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS public.line_notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL UNIQUE REFERENCES public.leads(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('buyer','owner','partner','buyer_requirement','seller_submission')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','retry','failed')),
  retry_key uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 8),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,
  lease_until timestamptz,
  first_attempt_at timestamptz,
  request_fingerprint text,
  last_error text CHECK (length(last_error) <= 100),
  last_http_status integer,
  line_request_id text CHECK (length(line_request_id) <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CHECK ((status = 'processing') = (lease_token IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS line_notification_due ON public.line_notification_outbox (available_at, created_at)
  WHERE status IN ('pending','retry','processing');
CREATE INDEX IF NOT EXISTS line_notification_retention ON public.line_notification_outbox (updated_at)
  WHERE status IN ('sent','failed');
ALTER TABLE public.line_notification_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.line_notification_outbox FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.line_notification_outbox FROM anon;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anonymous') THEN
    REVOKE ALL ON public.line_notification_outbox FROM anonymous;
  END IF;
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.line_notification_outbox FROM authenticated;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enqueue_line_lead_notification() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.consent_pdpa AND NEW.consent_at IS NOT NULL AND NEW.lead_type::text IN ('buyer','owner','partner') THEN
    INSERT INTO public.line_notification_outbox (lead_id, event_type)
    VALUES (NEW.id, CASE
      WHEN NEW.lead_type::text = 'buyer' AND NEW.source = '/buy-request' THEN 'buyer_requirement'
      WHEN NEW.lead_type::text = 'owner' AND NEW.details ? 'property_submission_id' THEN 'seller_submission'
      ELSE NEW.lead_type::text END)
    ON CONFLICT (lead_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_line_lead_notification() FROM PUBLIC;
DROP TRIGGER IF EXISTS enqueue_line_lead_notification ON public.leads;
CREATE TRIGGER enqueue_line_lead_notification AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_line_lead_notification();

-- No historical backfill: migration-first cutover must quarantine jobs sent by the old sender.
COMMIT;
