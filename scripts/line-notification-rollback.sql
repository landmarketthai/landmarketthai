-- Stop worker invocations and disable LINE_NOTIFICATIONS_ENABLED before running.
-- Preserve queued jobs and delivery evidence for reconciliation; never delete CRM data.
BEGIN;
SET LOCAL lock_timeout = '5s';
DROP TRIGGER IF EXISTS enqueue_line_lead_notification ON public.leads;
DROP FUNCTION IF EXISTS public.enqueue_line_lead_notification();
COMMIT;
