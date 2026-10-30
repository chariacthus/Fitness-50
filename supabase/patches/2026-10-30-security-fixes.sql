-- =============================================================================
-- Stærk50 – PATCH 2026-10-30: security fixes + Min profil privacy functions
--
-- Run ONCE in Supabase → SQL Editor on a database that was created with the
-- earlier setup.sql. Safe to run again. No data is changed or deleted.
--
-- Fixes (found by the automated database security tests):
--  1. Visitors could execute RPC functions (Postgres grants EXECUTE to PUBLIC
--     by default) – e.g. read a member's billing summary by user id.
--  2. membership_state()/membership_summary() skipped the permission check
--     when no user was logged in.
--  3. Members could set created_at on their own messages (pin to top /
--     "unread" forever). The server time is now always used.
--  4. Admins could not replace or delete uploaded site images (logo, photos).
-- New:
--  5. withdraw_health_consent() so members can always withdraw consent.
--  6. Admins are no longer notified about already-completed data exports.
-- =============================================================================

begin;

-- 2. Permission check that also works when nobody is logged in
create or replace function public.membership_state(p_user uuid default null)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(p_user, auth.uid());
begin
  if target is null then
    return 'none';
  end if;
  -- "is distinct from" (not "<>"): without a logged-in user auth.uid() is null,
  -- "<>" yields null and the check was skipped, so a visitor could read any
  -- member's state. (Fix found by tests/db.)
  if target is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Ikke tilladt' using errcode = '42501';
  end if;
  return public._membership_state(target);
end;
$$;


create or replace function public.membership_summary(p_user uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(p_user, auth.uid());
  s record;
  grace integer;
  st text;
begin
  if target is null then
    return jsonb_build_object('state', 'none');
  end if;
  -- See membership_state(): "<>" let visitors read any member's billing summary.
  if target is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Ikke tilladt' using errcode = '42501';
  end if;
  st := public._membership_state(target);
  select coalesce((select a.grace_period_days from public.admin_settings a where a.id = 1), 7) into grace;

  select sub.*, p.name as product_name into s
  from public.subscriptions sub
  left join public.products p on p.id = sub.product_id
  where sub.user_id = target and (p.id is null or p.kind = 'membership')
  order by
    case sub.status
      when 'active' then 0 when 'trialing' then 0
      when 'past_due' then 1 when 'incomplete' then 2 when 'unpaid' then 3
      else 4
    end,
    sub.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('state', st);
  end if;

  return jsonb_build_object(
    'state', st,
    'subscription_id', s.id,
    'provider', s.provider,
    'status', s.status,
    'product_name', s.product_name,
    'amount', s.amount,
    'billing_interval', s.billing_interval,
    'cancel_at_period_end', s.cancel_at_period_end,
    'current_period_end', s.current_period_end,
    'access_until', case when st = 'canceling'
      then least(coalesce(s.cancel_at, s.current_period_end), coalesce(s.current_period_end, s.cancel_at))
      else null end,
    'grace_until', case when s.status = 'past_due'
      then coalesce(s.payment_failed_at, s.current_period_end, s.updated_at) + make_interval(days => grace)
      else null end
  );
end;
$$;


-- 3. Server time on messages
create or replace function public.rate_limit_messages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  new.created_at := now();
  if not public.check_rate_limit(tg_table_name || ':' || auth.uid()::text, 20, 60) then
    raise exception 'Du sender beskeder meget hurtigt. Vent et øjeblik og prøv igen.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;


-- 5 + 6. Min profil privacy functions (migration 20261030000050)
-- Withdrawing consent to store health information must always be possible,
-- also after the membership has ended (the onboarding update policy only lets
-- entitled members edit the questionnaire). Only ever touches the caller's own
-- row and only sets health_consent = false; the guard trigger on
-- onboarding_submissions then deletes health_info.
create or replace function public.withdraw_health_consent()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Du skal være logget ind' using errcode = '42501';
  end if;
  update public.onboarding_submissions
     set health_consent = false
   where user_id = me;
  return found;
end;
$$;

revoke execute on function public.withdraw_health_consent() from public, anon;
grant execute on function public.withdraw_health_consent() to authenticated;

-- Administrators are only asked to act on pending requests. Completed export
-- requests are logged by the server after a member downloads his own data and
-- need no attention.
create or replace function public.after_data_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'pending' then
    return new;
  end if;
  perform public._notify_admins(
    'data_request',
    case when new.type = 'deletion' then 'Anmodning om sletning af konto' else 'Anmodning om dataudtræk' end,
    'Et medlem har sendt en anmodning, som skal behandles.',
    '/admin/anmodninger',
    jsonb_build_object('request_id', new.id)
  );
  return new;
end;
$$;

-- 1. Function privileges: logged-in users and the server only
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;

revoke execute on function public._notify_admins(text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public._notify_user(uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public._membership_state(uuid) from public, anon, authenticated;
revoke execute on function public._is_entitled_user(uuid) from public, anon, authenticated;
revoke execute on function public._is_admin_user(uuid) from public, anon, authenticated;
revoke execute on function public._has_addon(uuid, text) from public, anon, authenticated;
revoke execute on function public._post_community_welcome(uuid) from public, anon, authenticated;
revoke execute on function public.bootstrap_admin(text) from public, anon, authenticated;
revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;

grant execute on function public._notify_admins(text, text, text, text, jsonb) to service_role;
grant execute on function public._notify_user(uuid, text, text, text, text, jsonb) to service_role;
grant execute on function public._membership_state(uuid) to service_role;
grant execute on function public._is_entitled_user(uuid) to service_role;
grant execute on function public._has_addon(uuid, text) to service_role;
grant execute on function public._post_community_welcome(uuid) to service_role;
grant execute on function public.bootstrap_admin(text) to service_role;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- Visitors only need the public settings and product list (the products
-- policy calls is_admin()).
grant execute on function public.is_admin() to anon;
grant execute on function public.is_entitled() to anon;

-- withdraw_health_consent must stay callable after the blanket grant above
revoke execute on function public.withdraw_health_consent() from public, anon;
grant execute on function public.withdraw_health_consent() to authenticated;

-- 4. Admins may read (and therefore replace/delete) site images
drop policy if exists "site: admins read" on storage.objects;
create policy "site: admins read" on storage.objects
  for select to authenticated
  using (bucket_id = 'site' and (select public.is_admin()));

commit;
