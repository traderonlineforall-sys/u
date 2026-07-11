-- Non-destructive emergency rollback for Primary Device Owner Identity v3.
--
-- 1. Set DEVICE_IDENTITY_V2_MODE=off and deploy the prior application code.
-- 2. Run this file to revoke v3 credentials/sessions and cancel pending tickets.
-- 3. Keep the v3 tables for audit and incident review; do not delete evidence.

begin;

update public.support_device_credentials
set revoked_at = coalesce(revoked_at, now())
where revoked_at is null;

update public.support_auth_sessions
set revoked_at = coalesce(revoked_at, now())
where revoked_at is null;

update public.support_device_recovery_tickets
set cancelled_at = coalesce(cancelled_at, now())
where used_at is null and cancelled_at is null;

revoke all on function public.sr_auth_rate_limit_take(text, text, integer, integer, integer) from service_role;
revoke all on function public.sr_consume_device_recovery_ticket(uuid, uuid, text, uuid) from service_role;
revoke all on function public.sr_forget_device_credential(uuid, text) from service_role;
revoke all on function public.sr_forget_device_identity(uuid, text) from service_role;

comment on table public.support_device_credentials is
  'V3 rollback applied: credentials retained for audit and revoked.';

commit;
