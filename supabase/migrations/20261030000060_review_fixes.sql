-- =============================================================================
-- Stærk50 – fixes from the independent security/privacy review (2026-10-30)
--
-- Written so the same file also works as a patch on a live database
-- (supabase/patches/2026-10-31-review-fixes.sql): it only uses
-- add column if not exists, create or replace, drop policy if exists +
-- create policy and create index if not exists, so it can run twice.
--
--  1. Stripe test/live separation (livemode on subscriptions and purchases,
--     stripe_livemode in admin_settings).
--  2. Access end of a cancelling subscription = cancel_at, else period end.
--  3. report_content('profile') only accepts profiles the reporter can see.
--  4. Members only read profiles of people they have a reason to see.
--  5. Community images: only images of visible messages (plus own folder).
--  6. Media of draft/scheduled announcements stays hidden from members.
--  7. Onboarding timestamps are server-controlled; admin notification is
--     rate limited.
--  8. data_requests: one pending request per type, max 5 per day.
--  9. Withdrawn health consent also resets has_limitations = 'ja'.
-- 10. Reports are readable by administrators only.
-- 11. A request the administrator has claimed (handled_by) cannot be cancelled.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. Stripe test/live separation
-- -----------------------------------------------------------------------------

-- Written by the webhook from subscription.livemode / session.livemode.
-- null = unknown (rows from before this column existed, manual grants).
alter table public.subscriptions add column if not exists livemode boolean;
alter table public.purchases add column if not exists livemode boolean;
-- The Stripe mode the site currently runs in (true = live keys). Set by the
-- server; null = unknown, then no row is filtered on its mode.
alter table public.admin_settings add column if not exists stripe_livemode boolean;

comment on column public.subscriptions.livemode is
  'Stripe livemode of the subscription. null = unknown. Rows from the other mode than admin_settings.stripe_livemode give no access.';
comment on column public.purchases.livemode is
  'Stripe livemode of the purchase. null = unknown or manual grant. Rows from the other mode than admin_settings.stripe_livemode give no access.';
comment on column public.admin_settings.stripe_livemode is
  'Stripe mode the site runs in (true = live, false = test). null = unknown: subscriptions and purchases are not filtered on their mode.';

-- 1 + 2. Membership state: ignore rows from the other Stripe mode, and use
-- cancel_at as the end of access when Stripe has set it (also for
-- cancel-at-period-end, where Stripe sets cancel_at to the period end). A
-- custom cancel date after the current period no longer locks the member out
-- at every renewal.
create or replace function public._membership_state(p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s record;
  grace integer;
  mode boolean;
  failed_at timestamptz;
  access_end timestamptz;
begin
  if p_user is null then
    return 'none';
  end if;
  if public._is_admin_user(p_user) then
    return 'admin';
  end if;

  select coalesce((select a.grace_period_days from public.admin_settings a where a.id = 1), 7) into grace;
  select a.stripe_livemode into mode from public.admin_settings a where a.id = 1;

  select sub.* into s
  from public.subscriptions sub
  left join public.products p on p.id = sub.product_id
  where sub.user_id = p_user
    and (p.id is null or p.kind = 'membership')
    -- A test-mode subscription gives no access once the site runs live (and
    -- the other way round). Unknown on either side = no filtering.
    and (mode is null or sub.livemode is null or sub.livemode = mode)
  order by
    case sub.status
      when 'active' then 0 when 'trialing' then 0
      when 'past_due' then 1 when 'incomplete' then 2 when 'unpaid' then 3
      else 4
    end,
    sub.created_at desc
  limit 1;

  if not found then
    return 'none';
  end if;

  if s.status in ('active', 'trialing') then
    if s.cancel_at_period_end or s.cancel_at is not null then
      access_end := coalesce(s.cancel_at, s.current_period_end);
      if access_end is not null and access_end < now() then
        return 'expired';
      end if;
      return 'canceling';
    end if;
    return 'active';
  elsif s.status = 'past_due' then
    failed_at := coalesce(s.payment_failed_at, s.current_period_end, s.updated_at);
    if failed_at + make_interval(days => grace) > now() then
      return 'past_due_grace';
    end if;
    return 'past_due';
  elsif s.status = 'unpaid' then
    return 'past_due';
  elsif s.status = 'incomplete' then
    return 'pending';
  elsif s.status = 'incomplete_expired' then
    return 'none';
  end if;
  return 'expired';
end;
$$;

revoke execute on function public._membership_state(uuid) from public, anon, authenticated;
grant execute on function public._membership_state(uuid) to service_role;

-- Detailed membership summary for the profile page / admin. Picks the same
-- subscription as _membership_state().
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
  mode boolean;
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
  select a.stripe_livemode into mode from public.admin_settings a where a.id = 1;

  select sub.*, p.name as product_name into s
  from public.subscriptions sub
  left join public.products p on p.id = sub.product_id
  where sub.user_id = target and (p.id is null or p.kind = 'membership')
    and (mode is null or sub.livemode is null or sub.livemode = mode)
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
      then coalesce(s.cancel_at, s.current_period_end)
      else null end,
    'grace_until', case when s.status = 'past_due'
      then coalesce(s.payment_failed_at, s.current_period_end, s.updated_at) + make_interval(days => grace)
      else null end
  );
end;
$$;

revoke execute on function public.membership_summary(uuid) from public, anon;
grant execute on function public.membership_summary(uuid) to authenticated, service_role;

-- Add-ons: a purchase from the other Stripe mode gives no access. Manual
-- grants (livemode null) always count.
create or replace function public._has_addon(p_user uuid, p_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.purchases pu
    join public.products pr on pr.id = pu.product_id
    where pu.user_id = p_user and pr.slug = p_slug and pu.status in ('paid', 'granted')
      and (pu.livemode is null
           or coalesce((select a.stripe_livemode from public.admin_settings a where a.id = 1) = pu.livemode, true))
  );
$$;

revoke execute on function public._has_addon(uuid, text) from public, anon, authenticated;
grant execute on function public._has_addon(uuid, text) to service_role;


-- -----------------------------------------------------------------------------
-- 4. Who may see a profile
-- -----------------------------------------------------------------------------

-- True when the caller may read this profile: his own, the coach, everything
-- for admins, and for entitled members only people they have a reason to see
-- – fellow entitled members, authors of visible community messages (also
-- former members) and people they share a conversation with. Sign-ups that
-- never paid are not visible to other members.
-- SECURITY DEFINER because _is_entitled_user() is not executable by members
-- and the lookups must not depend on the caller's own RLS.
create or replace function public.can_see_profile(p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_profile is not null and (
    p_profile = auth.uid()
    or exists (select 1 from public.profiles p where p.id = p_profile and p.is_coach)
    or public.is_admin()
    or (
      public.is_entitled()
      and (
        public._is_entitled_user(p_profile)
        or exists (
          select 1 from public.community_messages m
          where m.author_id = p_profile and m.hidden_at is null
        )
        or exists (
          select 1
          from public.conversation_participants mine
          join public.conversation_participants theirs on theirs.conversation_id = mine.conversation_id
          where mine.user_id = auth.uid() and theirs.user_id = p_profile
        )
      )
    )
  ), false);
$$;

revoke execute on function public.can_see_profile(uuid) from public, anon;
grant execute on function public.can_see_profile(uuid) to authenticated, service_role;

-- Profiles: own, the coach, admins, and – for entitled members – the people
-- can_see_profile() allows. The cheap checks come first so the per-row helper
-- only runs for entitled members.
drop policy if exists "profiles: read" on public.profiles;
create policy "profiles: read" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or is_coach
    or (select public.is_admin())
    or ((select public.is_entitled()) and public.can_see_profile(id))
  );

-- Speeds up the "authored a visible community message" check.
create index if not exists community_messages_author_idx on public.community_messages (author_id);


-- -----------------------------------------------------------------------------
-- 3. report_content: a profile can only be reported by someone who can see it
-- -----------------------------------------------------------------------------

-- Report content. Captures a snapshot so moderators never need general access
-- to private conversations.
create or replace function public.report_content(p_target_type text, p_target_id uuid, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  snap text;
  target_user uuid;
  new_id uuid;
begin
  if me is null then
    raise exception 'Du skal være logget ind' using errcode = '42501';
  end if;
  if p_reason is null or char_length(trim(p_reason)) = 0 then
    raise exception 'Skriv kort, hvorfor du anmelder' using errcode = '22023';
  end if;
  if not public.check_rate_limit('report:' || me::text, 10, 3600) then
    raise exception 'Du har sendt mange anmeldelser. Prøv igen senere.' using errcode = 'P0001';
  end if;

  if p_target_type = 'community_message' then
    if not public.can_use_community() then
      raise exception 'Ikke tilladt' using errcode = '42501';
    end if;
    select cm.body, cm.author_id into snap, target_user from public.community_messages cm
    where cm.id = p_target_id and cm.hidden_at is null;
  elsif p_target_type = 'private_message' then
    select pm.body, pm.sender_id into snap, target_user from public.private_messages pm
    where pm.id = p_target_id and public.is_conversation_participant(pm.conversation_id);
  elsif p_target_type = 'profile' then
    -- Same rule as the "profiles: read" policy: a profile the reporter cannot
    -- see is "not found" (no snapshot, no report, no admin notification).
    select coalesce(p.full_name, '') || coalesce(E'\n' || p.bio, ''), p.id into snap, target_user
    from public.profiles p
    where p.id = p_target_id and public.can_see_profile(p.id);
  else
    raise exception 'Ukendt type' using errcode = '22023';
  end if;

  if target_user is null and snap is null then
    raise exception 'Indholdet blev ikke fundet' using errcode = '22023';
  end if;

  insert into public.reports (reporter_id, target_type, target_id, target_user_id, reason, snapshot)
  values (me, p_target_type, p_target_id, target_user, left(trim(p_reason), 1000), snap)
  returning id into new_id;

  perform public._notify_admins('report', 'Ny anmeldelse', 'Et medlem har anmeldt indhold, som skal gennemgås.',
    '/admin/rapporter', jsonb_build_object('report_id', new_id));
  return new_id;
end;
$$;

revoke execute on function public.report_content(text, uuid, text) from public, anon;
grant execute on function public.report_content(text, uuid, text) to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 10. Reports: administrators only. The snapshot and the internal resolution
-- note are not for the reporter (the app never shows reporters their reports;
-- report_content() is SECURITY DEFINER and needs no read access).
-- -----------------------------------------------------------------------------

drop policy if exists "reports: read own or admin" on public.reports;
drop policy if exists "reports: admins read" on public.reports;
create policy "reports: admins read" on public.reports
  for select to authenticated using ((select public.is_admin()));


-- -----------------------------------------------------------------------------
-- 5. Community images: the owner's own folder (composer preview), admins, and
-- for community members only images of messages that are visible (not hidden
-- by a moderator, not deleted). Files are kept, so un-hiding still works.
-- -----------------------------------------------------------------------------

create index if not exists community_messages_image_path_idx
  on public.community_messages (image_path) where image_path is not null;

drop policy if exists "community: members read" on storage.objects;
create policy "community: members read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'community'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.is_admin())
      or (
        (select public.can_use_community())
        and exists (
          select 1 from public.community_messages cm
          where cm.image_path = storage.objects.name
            and cm.hidden_at is null
            and cm.deleted_at is null
        )
      )
    )
  );


-- -----------------------------------------------------------------------------
-- 6. Announcement media: members only see media (rows and files) attached to
-- an announcement that is published and whose publish time has passed. Drafts
-- and scheduled announcements stay hidden until then. Training media is
-- unchanged (entitled members).
-- -----------------------------------------------------------------------------

drop policy if exists "media: entitled read" on public.media;
create policy "media: entitled read" on public.media
  for select to authenticated
  using (
    (select public.is_admin())
    or (bucket = 'training-media' and (select public.is_entitled()))
    or (
      bucket = 'announcements'
      and (select public.is_entitled())
      and exists (
        select 1
        from public.announcement_media am
        join public.announcements a on a.id = am.announcement_id
        where am.media_id = media.id and a.status = 'published' and a.published_at <= now()
      )
    )
  );

drop policy if exists "announcements: entitled read" on storage.objects;
create policy "announcements: entitled read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'announcements'
    and (
      (select public.is_admin())
      or (
        (select public.is_entitled())
        and exists (
          select 1
          from public.media m
          join public.announcement_media am on am.media_id = m.id
          join public.announcements a on a.id = am.announcement_id
          where m.bucket = 'announcements'
            and m.path = storage.objects.name
            and a.status = 'published'
            and a.published_at <= now()
        )
      )
    )
  );


-- -----------------------------------------------------------------------------
-- 7 + 9. Onboarding
-- -----------------------------------------------------------------------------

-- Onboarding: members can draft/submit, never mark as reviewed. submitted_at
-- and health_consent_at are set by the server only (the consent timestamp is
-- the evidence of when consent was given). Without consent no health
-- information is kept – also not the answer "ja" to has_limitations.
create or replace function public.guard_onboarding()
returns trigger
language plpgsql
as $$
begin
  if not (public.is_service_context() or public.is_admin()) then
    if new.status = 'reviewed' and (tg_op = 'INSERT' or old.status <> 'reviewed') then
      raise exception 'Du kan ikke markere skemaet som gennemgået' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and (new.user_id <> old.user_id
       or new.reviewed_at is distinct from old.reviewed_at
       or new.reviewed_by is distinct from old.reviewed_by) then
      raise exception 'Du har ikke tilladelse til at ændre dette felt' using errcode = '42501';
    end if;
    -- Server-controlled timestamps: values sent by the member are ignored and
    -- set below (submitting, giving consent).
    if tg_op = 'INSERT' then
      new.reviewed_at := null;
      new.reviewed_by := null;
      new.submitted_at := null;
      new.health_consent_at := null;
    else
      new.submitted_at := old.submitted_at;
      new.health_consent_at := old.health_consent_at;
    end if;
    -- Editing a reviewed questionnaire sends it back to Christian.
    if tg_op = 'UPDATE' and old.status = 'reviewed' and new.status = 'reviewed'
       and (new.answers is distinct from old.answers or new.health_info is distinct from old.health_info
            or new.nutrition_answers is distinct from old.nutrition_answers) then
      new.status := 'submitted';
      new.submitted_at := now();
    end if;
  end if;

  if new.health_consent and (tg_op = 'INSERT' or not old.health_consent) then
    new.health_consent_at := now();
  end if;
  if not new.health_consent then
    -- Withdrawing consent removes the sensitive information.
    new.health_consent_at := null;
    new.health_info := null;
    -- "Ja, der er noget Christian bør vide" is itself health information.
    if new.answers ->> 'has_limitations' = 'ja' then
      new.answers := jsonb_set(new.answers, '{has_limitations}', '"vil_ikke_oplyse"');
    end if;
  end if;
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status <> 'submitted') then
    new.submitted_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_onboarding() from public, anon;
grant execute on function public.guard_onboarding() to authenticated, service_role;

-- At most 3 "Nyt onboardingskema" notifications per member per 24 hours, so
-- toggling the status cannot flood the administrators. Skipping the
-- notification never fails the save.
create or replace function public.after_onboarding_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_name text;
begin
  update public.profiles
     set onboarding_status = case when new.status in ('submitted', 'reviewed') then 'submitted' else 'in_progress' end
   where id = new.user_id;

  if new.status = 'submitted'
     and (tg_op = 'INSERT' or old.status <> 'submitted' or old.submitted_at is distinct from new.submitted_at) then
    if public.check_rate_limit('onboarding_notify:' || new.user_id::text, 3, 86400) then
      select nullif(p.full_name, '') into member_name from public.profiles p where p.id = new.user_id;
      perform public._notify_admins(
        'onboarding',
        'Nyt onboardingskema',
        coalesce(member_name, 'Et medlem') || ' har udfyldt sit onboardingskema.',
        '/admin/onboarding/' || new.id,
        jsonb_build_object('submission_id', new.id, 'user_id', new.user_id)
      );
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.after_onboarding_change() from public, anon;
grant execute on function public.after_onboarding_change() to authenticated, service_role;


-- -----------------------------------------------------------------------------
-- 8 + 11. Data requests
-- -----------------------------------------------------------------------------

-- A live database may already hold several pending requests of the same type
-- for one member (direct API inserts). Keep the oldest and close the others,
-- so the unique index below can be created. Nothing is deleted.
update public.data_requests d
   set status = 'canceled',
       note = coalesce(d.note, 'Lukket automatisk: der var allerede en ventende anmodning af samme type.')
 where d.status = 'pending'
   and d.user_id is not null
   and exists (
     select 1 from public.data_requests o
     where o.user_id = d.user_id and o.type = d.type and o.status = 'pending'
       and (o.created_at, o.id) < (d.created_at, d.id)
   );

-- One pending request per member and type.
create unique index if not exists data_requests_one_pending
  on public.data_requests (user_id, type) where status = 'pending';

-- Administrators are only asked to act on pending requests. Completed export
-- requests are logged by the server after a member downloads his own data and
-- need no attention. A logged-in user can send at most 5 requests per 24
-- hours (cancelling and sending again counts), so nobody can flood the
-- administrators.
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
  if auth.uid() is not null then
    if not public.check_rate_limit('data_request:' || auth.uid()::text, 5, 86400) then
      raise exception 'Du har sendt mange anmodninger i dag. Prøv igen i morgen, eller kontakt os.' using errcode = 'P0001';
    end if;
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

revoke execute on function public.after_data_request() from public, anon;
grant execute on function public.after_data_request() to authenticated, service_role;

-- Members can only cancel their own pending request, and not once the
-- administrator has claimed it (handled_by is set by the server before an
-- account is deleted).
create or replace function public.guard_data_request()
returns trigger
language plpgsql
as $$
begin
  if public.is_service_context() or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending';
    new.handled_by := null;
    new.completed_at := null;
    new.user_email := (select pp.email from public.profile_private pp where pp.user_id = auth.uid());
    return new;
  end if;
  if old.status = 'pending' and old.handled_by is not null then
    raise exception 'Anmodningen er allerede under behandling og kan ikke annulleres' using errcode = '42501';
  end if;
  if old.status <> 'pending' or new.status <> 'canceled' or new.type <> old.type
     or new.user_id is distinct from old.user_id or new.handled_by is distinct from old.handled_by then
    raise exception 'Du kan kun annullere en ventende anmodning' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_data_request() from public, anon;
grant execute on function public.guard_data_request() to authenticated, service_role;
