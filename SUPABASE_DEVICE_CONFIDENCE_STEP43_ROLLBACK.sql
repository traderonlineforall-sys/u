-- Rollback for Step 4.3 Device Confidence Nickname Lock
-- This removes only the optional device-confidence table. It does not delete
-- support_users, messages, suggestions, or existing nicknames.

drop table if exists public.support_user_devices;
