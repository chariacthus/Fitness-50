-- =============================================================================
-- Stærk50 – Min profil: privacy self-service
-- =============================================================================

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
