-- =============================================================================
-- Stærk50 – database schema, helper functions, triggers and Row Level Security
-- Apply in order: 0001_schema, 0002_storage, 0003_seed.
-- All business rules that protect members' data live here, not in the UI.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Generic helpers
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- True when the statement runs with elevated rights: the service role used by
-- the server (webhooks, admin client), the database owner (migrations, SQL
-- editor) or inside a SECURITY DEFINER function owned by postgres.
-- Deliberately SECURITY INVOKER so current_user reflects the real caller.
create or replace function public.is_service_context()
returns boolean
language sql
stable
as $$
  select current_user in ('postgres', 'service_role', 'supabase_admin', 'supabase_auth_admin');
$$;

-- -----------------------------------------------------------------------------
-- Settings
-- -----------------------------------------------------------------------------

-- Public brand and business information (readable by everyone, incl. visitors).
create table public.site_settings (
  id smallint primary key default 1 check (id = 1),
  business_name text not null default 'Stærk50' check (char_length(business_name) between 1 and 80),
  slogan text not null default 'Mere styrke. Mere overskud. Sammen.' check (char_length(slogan) <= 160),
  coach_name text not null default 'Christian' check (char_length(coach_name) between 1 and 80),
  coach_badge_label text not null default 'Christian · Træner' check (char_length(coach_badge_label) between 1 and 60),
  coach_short_bio text check (char_length(coach_short_bio) <= 600),
  coach_bio text check (char_length(coach_bio) <= 6000),
  coach_photo_path text,
  hero_image_path text,
  contact_email text check (char_length(contact_email) <= 200),
  contact_phone text check (char_length(contact_phone) <= 40),
  company_name text check (char_length(company_name) <= 160),
  cvr_number text check (char_length(cvr_number) <= 20),
  company_address text check (char_length(company_address) <= 300),
  brand_color text not null default '#4F5D3A' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_path text,
  membership_description text check (char_length(membership_description) <= 4000),
  nutrition_description text check (char_length(nutrition_description) <= 4000),
  community_welcome_message text not null default 'Velkommen til fællesskabet, {navn}! Her deler vi erfaringer, spørgsmål og små sejre. Sig gerne hej og fortæl lidt om dig selv.'
    check (char_length(community_welcome_message) <= 2000),
  -- The account shown as the coach (verified badge, default "Skriv til Christian").
  coach_user_id uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- Operational settings (administrators only).
create table public.admin_settings (
  id smallint primary key default 1 check (id = 1),
  checkout_enabled boolean not null default false,
  grace_period_days integer not null default 7 check (grace_period_days between 0 and 60),
  email_notifications_enabled boolean not null default false,
  admin_notification_email text check (char_length(admin_notification_email) <= 200),
  max_image_mb integer not null default 10 check (max_image_mb between 1 and 50),
  max_video_mb integer not null default 50 check (max_video_mb between 1 and 5000),
  data_retention_months integer not null default 24 check (data_retention_months between 1 and 120),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- -----------------------------------------------------------------------------
-- Products (membership + add-ons). Prices are stored in øre (1 kr = 100 øre).
-- -----------------------------------------------------------------------------

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  kind text not null check (kind in ('membership', 'addon')),
  name text not null check (char_length(name) between 1 and 120),
  short_description text check (char_length(short_description) <= 400),
  description text check (char_length(description) <= 4000),
  features text[] not null default '{}',
  price_amount integer check (price_amount is null or price_amount > 0),
  currency text not null default 'dkk' check (currency = 'dkk'),
  billing_interval text not null check (billing_interval in ('one_time', 'month', 'quarter', 'year')),
  stripe_product_id text,
  stripe_price_id text,
  -- Test products can only be bought while Stripe runs in test mode.
  is_test boolean not null default true,
  is_active boolean not null default false,
  -- MobilePay via Stripe is only possible for one-time purchases.
  mobilepay_enabled boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_is_recurring check (kind <> 'membership' or billing_interval <> 'one_time'),
  constraint mobilepay_one_time_only check (not mobilepay_enabled or billing_interval = 'one_time')
);

-- -----------------------------------------------------------------------------
-- Users: roles, profiles, private profile data
-- -----------------------------------------------------------------------------

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin')),
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id) on delete set null,
  primary key (user_id, role)
);

-- Community-visible profile information only. Contact details live in
-- profile_private.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  avatar_path text,
  bio text check (char_length(bio) <= 500),
  is_coach boolean not null default false,
  community_suspended boolean not null default false,
  onboarding_status text not null default 'not_started'
    check (onboarding_status in ('not_started', 'in_progress', 'submitted')),
  welcomed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_private (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  phone text check (char_length(phone) <= 40),
  contact_preference text check (contact_preference in ('email', 'telefon', 'beskeder')),
  suspension_reason text check (char_length(suspension_reason) <= 1000),
  email_notifications boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = auth.uid() and r.role = 'admin'
  );
$$;

create or replace function public._is_admin_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = p_user and r.role = 'admin'
  );
$$;

-- -----------------------------------------------------------------------------
-- Billing: customers, subscriptions, provider events, one-time purchases
-- -----------------------------------------------------------------------------

create table public.billing_customers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  provider text not null default 'stripe' check (provider in ('stripe', 'mobilepay')),
  provider_subscription_id text not null,
  provider_customer_id text,
  provider_price_id text,
  -- Mirrors the provider status (Stripe subscription statuses).
  status text not null check (status in (
    'incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'
  )),
  cancel_at_period_end boolean not null default false,
  cancel_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  ended_at timestamptz,
  -- First failed renewal in the current dunning cycle (cleared when paid).
  payment_failed_at timestamptz,
  amount integer,
  billing_interval text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_subscription_id)
);
create index subscriptions_user_idx on public.subscriptions (user_id);

-- Every verified provider event, stored once (idempotency + audit trail).
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('stripe', 'mobilepay')),
  provider_event_id text not null,
  event_type text not null,
  user_id uuid references auth.users (id) on delete set null,
  livemode boolean,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  error text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, provider_event_id)
);
create index payment_events_received_idx on public.payment_events (received_at desc);

-- One-time purchases of add-ons (e.g. the nutrition plan) and manual grants.
create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  provider text not null check (provider in ('stripe', 'manual')),
  provider_checkout_session_id text unique,
  provider_payment_intent_id text,
  amount integer,
  currency text not null default 'dkk',
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'refunded', 'granted', 'canceled')),
  granted_by uuid references auth.users (id) on delete set null,
  note text check (char_length(note) <= 1000),
  paid_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index purchases_user_idx on public.purchases (user_id);

-- -----------------------------------------------------------------------------
-- Membership state – the single source of truth for access decisions.
-- States: none | pending | active | canceling | past_due_grace | past_due | expired | admin
-- Entitled states: active, canceling, past_due_grace, admin
-- -----------------------------------------------------------------------------

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

  select sub.* into s
  from public.subscriptions sub
  left join public.products p on p.id = sub.product_id
  where sub.user_id = p_user
    and (p.id is null or p.kind = 'membership')
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
      access_end := least(coalesce(s.cancel_at, s.current_period_end), coalesce(s.current_period_end, s.cancel_at));
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

-- Membership state for the caller, or for any member when called by an admin.
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

-- Detailed membership summary for the profile page / admin.
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

create or replace function public.is_entitled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public._membership_state(auth.uid()) in ('active', 'canceling', 'past_due_grace', 'admin');
$$;

create or replace function public._is_entitled_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public._membership_state(p_user) in ('active', 'canceling', 'past_due_grace', 'admin');
$$;

-- Admins, or entitled members whose community access is not suspended.
create or replace function public.can_use_community()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
    or (
      public.is_entitled()
      and not coalesce((select p.community_suspended from public.profiles p where p.id = auth.uid()), true)
    );
$$;

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
  );
$$;

create or replace function public.has_addon(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public._has_addon(auth.uid(), p_slug);
$$;

-- -----------------------------------------------------------------------------
-- Rate limiting (fixed window). Used by server actions and message triggers.
-- -----------------------------------------------------------------------------

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 0
);

create or replace function public.check_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  current_count integer;
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count = case
          when rl.window_start < now() - make_interval(secs => p_window_seconds) then 1
          else rl.count + 1
        end,
        window_start = case
          when rl.window_start < now() - make_interval(secs => p_window_seconds) then now()
          else rl.window_start
        end
  returning count into current_count;
  return current_count <= p_max;
end;
$$;

-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in (
    'message', 'announcement', 'training_plan', 'nutrition_plan', 'membership', 'payment',
    'onboarding', 'new_member', 'nutrition_request', 'report', 'data_request', 'contact', 'system'
  )),
  title text not null check (char_length(title) between 1 and 200),
  body text check (char_length(body) <= 1000),
  link text check (link is null or link ~ '^/'),
  data jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- Internal: notify every administrator. Not callable by clients.
create or replace function public._notify_admins(
  p_type text, p_title text, p_body text, p_link text, p_data jsonb default '{}'
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, type, title, body, link, data)
  select r.user_id, p_type, p_title, p_body, p_link, coalesce(p_data, '{}'::jsonb)
  from public.user_roles r
  where r.role = 'admin';
$$;

create or replace function public._notify_user(
  p_user uuid, p_type text, p_title text, p_body text, p_link text, p_data jsonb default '{}'
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, type, title, body, link, data)
  values (p_user, p_type, p_title, p_body, p_link, coalesce(p_data, '{}'::jsonb));
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  affected integer;
begin
  if auth.uid() is null then
    raise exception 'Ikke logget ind' using errcode = '42501';
  end if;
  update public.notifications n
     set read_at = now()
   where n.user_id = auth.uid()
     and n.read_at is null
     and (p_ids is null or n.id = any (p_ids));
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- -----------------------------------------------------------------------------
-- Onboarding questionnaire
-- -----------------------------------------------------------------------------

create table public.onboarding_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'reviewed')),
  current_step integer not null default 0 check (current_step between 0 and 20),
  -- Validated by the application (zod). Contains no health information.
  answers jsonb not null default '{}',
  -- Sensitive: injuries / limitations. Only stored with explicit consent.
  health_info text check (char_length(health_info) <= 4000),
  health_consent boolean not null default false,
  health_consent_at timestamptz,
  nutrition_answers jsonb,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_requires_consent check (
    health_info is null or char_length(trim(health_info)) = 0 or health_consent
  )
);

-- -----------------------------------------------------------------------------
-- Media (uploaded by administrators: announcements, exercise videos, site images)
-- -----------------------------------------------------------------------------

create table public.media (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users (id) on delete set null,
  bucket text not null check (bucket in ('announcements', 'training-media', 'site')),
  path text not null,
  kind text not null check (kind in ('image', 'video')),
  mime_type text not null,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  title text check (char_length(title) <= 200),
  description text check (char_length(description) <= 2000),
  created_at timestamptz not null default now(),
  unique (bucket, path)
);

-- -----------------------------------------------------------------------------
-- Training plans
-- -----------------------------------------------------------------------------

create table public.training_plans (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  goal text check (char_length(goal) <= 1000),
  description text check (char_length(description) <= 6000),
  coach_notes text check (char_length(coach_notes) <= 6000),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index training_plans_one_published on public.training_plans (member_id) where status = 'published';
create index training_plans_member_idx on public.training_plans (member_id, created_at desc);

create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.training_plans (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  day_label text check (char_length(day_label) <= 60),
  description text check (char_length(description) <= 4000),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index training_sessions_plan_idx on public.training_sessions (plan_id, position);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  instructions text check (char_length(instructions) <= 4000),
  sets integer check (sets is null or sets between 1 and 50),
  reps text check (char_length(reps) <= 40),
  duration text check (char_length(duration) <= 40),
  rest text check (char_length(rest) <= 40),
  video_url text check (video_url is null or video_url ~* '^https://'),
  media_id uuid references public.media (id) on delete set null,
  notes text check (char_length(notes) <= 2000),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index exercises_session_idx on public.exercises (session_id, position);

create table public.workout_completions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references public.training_sessions (id) on delete cascade,
  completed_on date not null default ((now() at time zone 'Europe/Copenhagen')::date),
  completed_at timestamptz not null default now(),
  note text check (char_length(note) <= 1000),
  unique (member_id, session_id, completed_on)
);
create index workout_completions_member_idx on public.workout_completions (member_id, completed_at desc);

-- -----------------------------------------------------------------------------
-- Nutrition plans (add-on)
-- -----------------------------------------------------------------------------

create table public.nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  intro text check (char_length(intro) <= 4000),
  general_guidance text check (char_length(general_guidance) <= 8000),
  meal_structure text check (char_length(meal_structure) <= 8000),
  personal_notes text check (char_length(personal_notes) <= 6000),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index nutrition_plans_one_published on public.nutrition_plans (member_id) where status = 'published';

create table public.nutrition_meals (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.nutrition_plans (id) on delete cascade,
  meal_type text not null check (meal_type in ('morgenmad', 'formiddag', 'frokost', 'eftermiddag', 'aftensmad', 'aften', 'andet')),
  title text not null check (char_length(title) between 1 and 160),
  description text check (char_length(description) <= 4000),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index nutrition_meals_plan_idx on public.nutrition_meals (plan_id, position);

-- -----------------------------------------------------------------------------
-- Announcements (Christian only – no comments, no replies)
-- -----------------------------------------------------------------------------

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users (id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '' check (char_length(body) <= 20000),
  video_title text check (char_length(video_title) <= 200),
  video_description text check (char_length(video_description) <= 2000),
  location_name text check (char_length(location_name) <= 200),
  location_address text check (char_length(location_address) <= 300),
  map_url text check (map_url is null or map_url ~* '^https://'),
  is_pinned boolean not null default false,
  is_important boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index announcements_published_idx on public.announcements (status, published_at desc);

create table public.announcement_media (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  media_id uuid not null references public.media (id) on delete cascade,
  position integer not null default 0,
  primary key (announcement_id, media_id)
);

-- -----------------------------------------------------------------------------
-- Community (one shared group for all entitled members)
-- -----------------------------------------------------------------------------

create table public.community_messages (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users (id) on delete set null,
  body text not null default '' check (char_length(body) <= 4000),
  image_path text,
  reply_to_id uuid references public.community_messages (id) on delete set null,
  is_system boolean not null default false,
  hidden_at timestamptz,
  hidden_by uuid references auth.users (id) on delete set null,
  hidden_reason text check (char_length(hidden_reason) <= 1000),
  deleted_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  constraint community_message_has_content check (
    deleted_at is not null or char_length(trim(body)) > 0 or image_path is not null
  )
);
create index community_messages_created_idx on public.community_messages (created_at desc);

create table public.community_reads (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_read_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Private conversations
-- -----------------------------------------------------------------------------

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  -- "<smaller uuid>:<larger uuid>" – guarantees one direct conversation per pair.
  direct_key text unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_participants_user_idx on public.conversation_participants (user_id);

create table public.private_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid references auth.users (id) on delete set null,
  body text not null check (char_length(body) <= 4000),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint private_message_has_content check (deleted_at is not null or char_length(trim(body)) > 0)
);
create index private_messages_conversation_idx on public.private_messages (conversation_id, created_at);

create or replace function public.is_conversation_participant(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_participants cp
    where cp.conversation_id = p_conversation and cp.user_id = auth.uid()
  );
$$;

-- -----------------------------------------------------------------------------
-- Reports and moderation
-- -----------------------------------------------------------------------------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users (id) on delete set null,
  target_type text not null check (target_type in ('community_message', 'private_message', 'profile')),
  target_id uuid not null,
  target_user_id uuid references auth.users (id) on delete set null,
  reason text not null check (char_length(reason) between 1 and 1000),
  -- Copy of the reported content at the time of the report. This is the only
  -- way an administrator sees the content of a reported private message.
  snapshot text,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  resolution_note text check (char_length(resolution_note) <= 1000),
  created_at timestamptz not null default now()
);
create index reports_status_idx on public.reports (status, created_at desc);

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users (id) on delete set null,
  action text not null check (action in (
    'hide_message', 'unhide_message', 'suspend_user', 'restore_user', 'resolve_report', 'dismiss_report'
  )),
  target_user_id uuid references auth.users (id) on delete set null,
  target_id uuid,
  reason text check (char_length(reason) <= 1000),
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Privacy requests and public contact form
-- -----------------------------------------------------------------------------

create table public.data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  user_email text,
  type text not null check (type in ('export', 'deletion')),
  status text not null default 'pending' check (status in ('pending', 'completed', 'rejected', 'canceled')),
  note text check (char_length(note) <= 1000),
  handled_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 200),
  phone text check (char_length(phone) <= 40),
  message text not null check (char_length(message) between 1 and 5000),
  user_id uuid references auth.users (id) on delete set null,
  handled_at timestamptz,
  handled_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- =============================================================================
-- Triggers
-- =============================================================================

create trigger site_settings_updated before update on public.site_settings for each row execute function public.set_updated_at();
create trigger admin_settings_updated before update on public.admin_settings for each row execute function public.set_updated_at();
create trigger products_updated before update on public.products for each row execute function public.set_updated_at();
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger profile_private_updated before update on public.profile_private for each row execute function public.set_updated_at();
create trigger subscriptions_updated before update on public.subscriptions for each row execute function public.set_updated_at();
create trigger purchases_updated before update on public.purchases for each row execute function public.set_updated_at();
create trigger onboarding_updated before update on public.onboarding_submissions for each row execute function public.set_updated_at();
create trigger training_plans_updated before update on public.training_plans for each row execute function public.set_updated_at();
create trigger training_sessions_updated before update on public.training_sessions for each row execute function public.set_updated_at();
create trigger exercises_updated before update on public.exercises for each row execute function public.set_updated_at();
create trigger nutrition_plans_updated before update on public.nutrition_plans for each row execute function public.set_updated_at();
create trigger nutrition_meals_updated before update on public.nutrition_meals for each row execute function public.set_updated_at();
create trigger announcements_updated before update on public.announcements for each row execute function public.set_updated_at();

-- New auth user → profile rows.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120))
  on conflict (id) do nothing;
  insert into public.profile_private (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Removes a same-named trigger left by Supabase starter templates.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profile_private set email = new.email where user_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- Members may only change their own name, avatar and bio.
create or replace function public.guard_profiles()
returns trigger
language plpgsql
as $$
begin
  if public.is_service_context() or public.is_admin() then
    return new;
  end if;
  if new.id <> old.id
     or new.is_coach <> old.is_coach
     or new.community_suspended <> old.community_suspended
     or new.onboarding_status <> old.onboarding_status
     or new.welcomed_at is distinct from old.welcomed_at
     or new.created_at <> old.created_at then
    raise exception 'Du har ikke tilladelse til at ændre dette felt' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles for each row execute function public.guard_profiles();

create or replace function public.guard_profile_private()
returns trigger
language plpgsql
as $$
begin
  if public.is_service_context() or public.is_admin() then
    return new;
  end if;
  if new.user_id <> old.user_id
     or new.email is distinct from old.email
     or new.suspension_reason is distinct from old.suspension_reason then
    raise exception 'Du har ikke tilladelse til at ændre dette felt' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger profile_private_guard before update on public.profile_private for each row execute function public.guard_profile_private();

-- Keep profiles.is_coach in sync with the admin role.
create or replace function public.sync_coach_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.profiles set is_coach = public._is_admin_user(old.user_id) where id = old.user_id;
    return old;
  end if;
  update public.profiles set is_coach = true where id = new.user_id;
  return new;
end;
$$;
create trigger user_roles_sync_coach after insert or delete on public.user_roles
  for each row execute function public.sync_coach_flag();

-- Onboarding: members can draft/submit, never mark as reviewed.
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
    if tg_op = 'INSERT' then
      new.reviewed_at := null;
      new.reviewed_by := null;
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
  end if;
  if new.status = 'submitted' and (tg_op = 'INSERT' or old.status <> 'submitted') then
    new.submitted_at := now();
  end if;
  return new;
end;
$$;
create trigger onboarding_guard before insert or update on public.onboarding_submissions
  for each row execute function public.guard_onboarding();

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
    select nullif(p.full_name, '') into member_name from public.profiles p where p.id = new.user_id;
    perform public._notify_admins(
      'onboarding',
      'Nyt onboardingskema',
      coalesce(member_name, 'Et medlem') || ' har udfyldt sit onboardingskema.',
      '/admin/onboarding/' || new.id,
      jsonb_build_object('submission_id', new.id, 'user_id', new.user_id)
    );
  end if;
  return new;
end;
$$;
create trigger onboarding_after after insert or update on public.onboarding_submissions
  for each row execute function public.after_onboarding_change();

-- Community messages: authors may edit text or delete their own message.
create or replace function public.guard_community_message()
returns trigger
language plpgsql
as $$
begin
  if public.is_service_context() or public.is_admin() then
    return new;
  end if;
  if new.author_id is distinct from old.author_id
     or new.is_system <> old.is_system
     or new.hidden_at is distinct from old.hidden_at
     or new.hidden_by is distinct from old.hidden_by
     or new.hidden_reason is distinct from old.hidden_reason
     or new.reply_to_id is distinct from old.reply_to_id
     or new.created_at <> old.created_at
     or (new.image_path is distinct from old.image_path and new.deleted_at is null)
     or (old.deleted_at is not null) then
    raise exception 'Du har ikke tilladelse til at ændre denne besked' using errcode = '42501';
  end if;
  if new.deleted_at is not null then
    new.deleted_at := now();
    new.body := '';
    new.image_path := null;
  elsif new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;
create trigger community_messages_guard before update on public.community_messages
  for each row execute function public.guard_community_message();

-- Message rate limits (applies to logged-in users, not to the server).
-- Also stamps the server time on messages from logged-in users: a client-set
-- created_at in the future would pin a post to the top of the feed and keep it
-- "unread" for everyone, even after mark_conversation_read(). (Fix found by tests/db.)
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
create trigger community_messages_rate_limit before insert on public.community_messages
  for each row execute function public.rate_limit_messages();
create trigger private_messages_rate_limit before insert on public.private_messages
  for each row execute function public.rate_limit_messages();

-- Private messages: only soft delete of own message.
create or replace function public.guard_private_message()
returns trigger
language plpgsql
as $$
begin
  if public.is_service_context() then
    return new;
  end if;
  if new.sender_id is distinct from old.sender_id
     or new.conversation_id <> old.conversation_id
     or new.created_at <> old.created_at
     or old.deleted_at is not null
     or new.deleted_at is null then
    raise exception 'Du kan kun slette dine egne beskeder' using errcode = '42501';
  end if;
  new.deleted_at := now();
  new.body := '';
  return new;
end;
$$;
create trigger private_messages_guard before update on public.private_messages
  for each row execute function public.guard_private_message();

-- New private message → bump conversation, notify the other participant(s).
-- Notifications never contain the message text.
create or replace function public.after_private_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sender_name text;
  recipient record;
  existing uuid;
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  update public.conversation_participants
     set last_read_at = new.created_at
   where conversation_id = new.conversation_id and user_id = new.sender_id;

  select coalesce(nullif(p.full_name, ''), 'Et medlem') into sender_name
  from public.profiles p where p.id = new.sender_id;

  for recipient in
    select cp.user_id from public.conversation_participants cp
    where cp.conversation_id = new.conversation_id and cp.user_id is distinct from new.sender_id
  loop
    select n.id into existing
    from public.notifications n
    where n.user_id = recipient.user_id
      and n.type = 'message'
      and n.read_at is null
      and n.data ->> 'conversation_id' = new.conversation_id::text
    limit 1;

    if existing is not null then
      update public.notifications
         set created_at = now(), body = 'Du har nye beskeder fra ' || coalesce(sender_name, 'et medlem') || '.'
       where id = existing;
    else
      perform public._notify_user(
        recipient.user_id,
        'message',
        'Ny besked',
        'Du har en ny besked fra ' || coalesce(sender_name, 'et medlem') || '.',
        '/beskeder/' || new.conversation_id,
        jsonb_build_object('conversation_id', new.conversation_id)
      );
    end if;
  end loop;
  return new;
end;
$$;
create trigger private_messages_after after insert on public.private_messages
  for each row execute function public.after_private_message();

-- Notifications: members may only mark as read.
create or replace function public.guard_notification()
returns trigger
language plpgsql
as $$
begin
  if public.is_service_context() then
    return new;
  end if;
  if new.user_id <> old.user_id or new.type <> old.type or new.title <> old.title
     or new.body is distinct from old.body or new.link is distinct from old.link
     or new.data <> old.data or new.created_at <> old.created_at then
    raise exception 'Du kan kun markere notifikationer som læst' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger notifications_guard before update on public.notifications
  for each row execute function public.guard_notification();

-- Data requests → notify administrators.
create or replace function public.after_data_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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
create trigger data_requests_after after insert on public.data_requests
  for each row execute function public.after_data_request();

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
  -- Members can only cancel their own pending request.
  if old.status <> 'pending' or new.status <> 'canceled' or new.type <> old.type
     or new.user_id is distinct from old.user_id or new.handled_by is distinct from old.handled_by then
    raise exception 'Du kan kun annullere en ventende anmodning' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger data_requests_guard before insert or update on public.data_requests
  for each row execute function public.guard_data_request();

-- =============================================================================
-- RPC functions used by the application
-- =============================================================================

-- Start (or reopen) a direct conversation with another user.
create or replace function public.get_or_create_direct_conversation(p_other uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  key text;
  conv uuid;
  me_admin boolean;
  other_admin boolean;
  me_suspended boolean;
begin
  if me is null then
    raise exception 'Du skal være logget ind' using errcode = '42501';
  end if;
  if p_other is null or p_other = me then
    raise exception 'Vælg en anden person at skrive til' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_other) then
    raise exception 'Personen findes ikke' using errcode = '22023';
  end if;

  me_admin := public._is_admin_user(me);
  other_admin := public._is_admin_user(p_other);
  select coalesce(community_suspended, false) into me_suspended from public.profiles where id = me;

  if not me_admin then
    if not public._is_entitled_user(me) then
      raise exception 'Private beskeder kræver et aktivt medlemskab' using errcode = '42501';
    end if;
    if not other_admin and (me_suspended or not public._is_entitled_user(p_other)) then
      raise exception 'Du kan ikke skrive til denne person lige nu' using errcode = '42501';
    end if;
  end if;

  key := least(me::text, p_other::text) || ':' || greatest(me::text, p_other::text);
  insert into public.conversations (direct_key, created_by)
  values (key, me)
  on conflict (direct_key) do nothing;
  select id into conv from public.conversations where direct_key = key;

  insert into public.conversation_participants (conversation_id, user_id)
  values (conv, me), (conv, p_other)
  on conflict do nothing;
  return conv;
end;
$$;

-- Whether the caller may post in a conversation (used by the insert policy).
create or replace function public.can_send_private_message(p_conversation uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  other record;
  me_suspended boolean;
begin
  if me is null or not public.is_conversation_participant(p_conversation) then
    return false;
  end if;
  if public._is_admin_user(me) then
    return true;
  end if;
  if not public._is_entitled_user(me) then
    return false;
  end if;
  select coalesce(community_suspended, false) into me_suspended from public.profiles where id = me;
  for other in
    select cp.user_id from public.conversation_participants cp
    where cp.conversation_id = p_conversation and cp.user_id <> me
  loop
    if public._is_admin_user(other.user_id) then
      continue;
    end if;
    if me_suspended or not public._is_entitled_user(other.user_id) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

create or replace function public.mark_conversation_read(p_conversation uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_conversation_participant(p_conversation) then
    raise exception 'Ikke tilladt' using errcode = '42501';
  end if;
  update public.conversation_participants
     set last_read_at = now()
   where conversation_id = p_conversation and user_id = auth.uid();
  update public.notifications
     set read_at = now()
   where user_id = auth.uid() and type = 'message' and read_at is null
     and data ->> 'conversation_id' = p_conversation::text;
end;
$$;

-- Conversation list for the caller with unread counts.
create or replace function public.my_conversations()
returns table (
  conversation_id uuid,
  other_user_id uuid,
  other_name text,
  other_avatar_path text,
  other_is_coach boolean,
  last_message_at timestamptz,
  last_message_body text,
  last_message_sender_id uuid,
  unread_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id,
    other.user_id,
    coalesce(nullif(op.full_name, ''), 'Medlem'),
    op.avatar_path,
    coalesce(op.is_coach, false),
    c.last_message_at,
    lm.body,
    lm.sender_id,
    (
      select count(*) from public.private_messages m
      where m.conversation_id = c.id
        and m.sender_id is distinct from auth.uid()
        and m.created_at > me.last_read_at
        and m.deleted_at is null
    )
  from public.conversation_participants me
  join public.conversations c on c.id = me.conversation_id
  left join lateral (
    select cp.user_id from public.conversation_participants cp
    where cp.conversation_id = c.id and cp.user_id <> auth.uid()
    limit 1
  ) other on true
  left join public.profiles op on op.id = other.user_id
  left join lateral (
    select m.body, m.sender_id from public.private_messages m
    where m.conversation_id = c.id and m.deleted_at is null
    order by m.created_at desc
    limit 1
  ) lm on true
  where me.user_id = auth.uid()
  order by c.last_message_at desc;
$$;

create or replace function public.unread_counts()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'notifications', (select count(*) from public.notifications n where n.user_id = auth.uid() and n.read_at is null),
    'messages', (
      select count(*) from public.private_messages m
      join public.conversation_participants cp on cp.conversation_id = m.conversation_id and cp.user_id = auth.uid()
      where m.sender_id is distinct from auth.uid() and m.created_at > cp.last_read_at and m.deleted_at is null
    ),
    'community', case when public.can_use_community() then (
      select count(*) from public.community_messages cm
      where cm.created_at > coalesce((select r.last_read_at from public.community_reads r where r.user_id = auth.uid()), now() - interval '7 days')
        and cm.author_id is distinct from auth.uid()
        and cm.hidden_at is null and cm.deleted_at is null
    ) else 0 end
  );
$$;

create or replace function public.mark_community_read()
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.community_reads (user_id, last_read_at)
  select auth.uid(), now() where auth.uid() is not null
  on conflict (user_id) do update set last_read_at = excluded.last_read_at;
$$;

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
    select coalesce(p.full_name, '') || coalesce(E'\n' || p.bio, ''), p.id into snap, target_user
    from public.profiles p where p.id = p_target_id;
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

-- Moderation (admins only, always logged).
create or replace function public.moderate_community_message(p_message uuid, p_hide boolean, p_reason text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  author uuid;
begin
  if not public.is_admin() then
    raise exception 'Kun administratorer' using errcode = '42501';
  end if;
  update public.community_messages
     set hidden_at = case when p_hide then now() else null end,
         hidden_by = case when p_hide then auth.uid() else null end,
         hidden_reason = case when p_hide then p_reason else null end
   where id = p_message
  returning author_id into author;
  insert into public.moderation_actions (admin_id, action, target_user_id, target_id, reason)
  values (auth.uid(), case when p_hide then 'hide_message' else 'unhide_message' end, author, p_message, p_reason);
end;
$$;

create or replace function public.set_community_suspension(p_user uuid, p_suspended boolean, p_reason text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Kun administratorer' using errcode = '42501';
  end if;
  if public._is_admin_user(p_user) then
    raise exception 'Administratorer kan ikke suspenderes' using errcode = '22023';
  end if;
  update public.profiles set community_suspended = p_suspended where id = p_user;
  update public.profile_private set suspension_reason = case when p_suspended then p_reason else null end where user_id = p_user;
  insert into public.moderation_actions (admin_id, action, target_user_id, reason)
  values (auth.uid(), case when p_suspended then 'suspend_user' else 'restore_user' end, p_user, p_reason);
  perform public._notify_user(
    p_user, 'system',
    case when p_suspended then 'Din adgang til fællesskabet er sat på pause' else 'Din adgang til fællesskabet er genåbnet' end,
    case when p_suspended then 'Kontakt Christian, hvis du har spørgsmål.' else 'Velkommen tilbage i fællesskabet.' end,
    '/faellesskab', '{}'::jsonb);
end;
$$;

create or replace function public.resolve_report(p_report uuid, p_status text, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Kun administratorer' using errcode = '42501';
  end if;
  if p_status not in ('resolved', 'dismissed') then
    raise exception 'Ugyldig status' using errcode = '22023';
  end if;
  update public.reports
     set status = p_status, resolved_by = auth.uid(), resolved_at = now(), resolution_note = p_note
   where id = p_report;
  insert into public.moderation_actions (admin_id, action, target_id, reason)
  values (auth.uid(), case when p_status = 'resolved' then 'resolve_report' else 'dismiss_report' end, p_report, p_note);
end;
$$;

-- Training plans: publishing archives the previous plan and notifies the member.
create or replace function public.publish_training_plan(p_plan uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  plan record;
  had_previous boolean;
begin
  if not public.is_admin() then
    raise exception 'Kun administratorer kan udgive planer' using errcode = '42501';
  end if;
  select * into plan from public.training_plans where id = p_plan for update;
  if not found then
    raise exception 'Planen findes ikke' using errcode = '22023';
  end if;
  if plan.status <> 'draft' then
    raise exception 'Kun kladder kan udgives' using errcode = '22023';
  end if;
  if not exists (select 1 from public.training_sessions s where s.plan_id = p_plan) then
    raise exception 'Planen skal have mindst én træningsdag' using errcode = '22023';
  end if;

  update public.training_plans
     set status = 'archived', archived_at = now()
   where member_id = plan.member_id and status = 'published';
  had_previous := found;

  update public.training_plans set status = 'published', published_at = now(), archived_at = null where id = p_plan;

  perform public._notify_user(
    plan.member_id, 'training_plan',
    case when had_previous then 'Din træningsplan er opdateret' else 'Din træningsplan er klar' end,
    'Christian har ' || case when had_previous then 'opdateret' else 'lavet' end || ' din træningsplan. Du finder den under Min træning.',
    '/min-traening', jsonb_build_object('plan_id', p_plan));
end;
$$;

create or replace function public.archive_training_plan(p_plan uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Kun administratorer' using errcode = '42501';
  end if;
  update public.training_plans set status = 'archived', archived_at = now() where id = p_plan and status <> 'archived';
end;
$$;

-- Copy a plan (any status) into a new draft for the same member.
create or replace function public.duplicate_training_plan(p_plan uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  new_plan uuid;
  sess record;
  new_session uuid;
begin
  if not public.is_admin() then
    raise exception 'Kun administratorer' using errcode = '42501';
  end if;
  insert into public.training_plans (member_id, title, goal, description, coach_notes, status, created_by)
  select member_id, title, goal, description, coach_notes, 'draft', auth.uid()
  from public.training_plans where id = p_plan
  returning id into new_plan;
  if new_plan is null then
    raise exception 'Planen findes ikke' using errcode = '22023';
  end if;
  for sess in select * from public.training_sessions where plan_id = p_plan order by position loop
    insert into public.training_sessions (plan_id, title, day_label, description, position)
    values (new_plan, sess.title, sess.day_label, sess.description, sess.position)
    returning id into new_session;
    insert into public.exercises (session_id, name, instructions, sets, reps, duration, rest, video_url, media_id, notes, position)
    select new_session, name, instructions, sets, reps, duration, rest, video_url, media_id, notes, position
    from public.exercises where session_id = sess.id;
  end loop;
  return new_plan;
end;
$$;

-- Nutrition plans can only be published to members entitled to the add-on.
create or replace function public.publish_nutrition_plan(p_plan uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  plan record;
begin
  if not public.is_admin() then
    raise exception 'Kun administratorer kan udgive planer' using errcode = '42501';
  end if;
  select * into plan from public.nutrition_plans where id = p_plan for update;
  if not found then
    raise exception 'Planen findes ikke' using errcode = '22023';
  end if;
  if plan.status <> 'draft' then
    raise exception 'Kun kladder kan udgives' using errcode = '22023';
  end if;
  if not public._has_addon(plan.member_id, 'kostplan') then
    raise exception 'Medlemmet har ikke adgang til en kostplan. Køb eller tildel adgang først.' using errcode = '42501';
  end if;
  update public.nutrition_plans set status = 'archived', archived_at = now()
   where member_id = plan.member_id and status = 'published';
  update public.nutrition_plans set status = 'published', published_at = now(), archived_at = null where id = p_plan;
  perform public._notify_user(plan.member_id, 'nutrition_plan', 'Din kostplan er klar',
    'Christian har lavet din personlige kostplan. Du finder den under Min træning.',
    '/min-traening/kostplan', jsonb_build_object('plan_id', p_plan));
end;
$$;

create or replace function public.archive_nutrition_plan(p_plan uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Kun administratorer' using errcode = '42501';
  end if;
  update public.nutrition_plans set status = 'archived', archived_at = now() where id = p_plan and status <> 'archived';
end;
$$;

-- Explicit administrative grant of an add-on (e.g. as a gift or after manual payment).
create or replace function public.grant_addon(p_user uuid, p_slug text, p_note text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  prod uuid;
  new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Kun administratorer' using errcode = '42501';
  end if;
  select id into prod from public.products where slug = p_slug and kind = 'addon';
  if prod is null then
    raise exception 'Tilkøbet findes ikke' using errcode = '22023';
  end if;
  if public._has_addon(p_user, p_slug) then
    raise exception 'Medlemmet har allerede adgang' using errcode = '22023';
  end if;
  insert into public.purchases (user_id, product_id, provider, status, granted_by, note)
  values (p_user, prod, 'manual', 'granted', auth.uid(), p_note)
  returning id into new_id;
  return new_id;
end;
$$;

-- Announcements: publish and (for important ones) notify all entitled members.
create or replace function public.publish_announcement(p_announcement uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a record;
  notified integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Kun administratorer kan udgive opslag' using errcode = '42501';
  end if;
  update public.announcements
     set status = 'published', published_at = coalesce(published_at, now())
   where id = p_announcement
  returning * into a;
  if not found then
    raise exception 'Opslaget findes ikke' using errcode = '22023';
  end if;

  if a.is_important and a.notified_at is null and a.published_at <= now() then
    insert into public.notifications (user_id, type, title, body, link, data)
    select p.id, 'announcement', 'Nyt opslag fra ' || coalesce((select s.coach_name from public.site_settings s where s.id = 1), 'Christian'),
           left(a.title, 200), '/opslag/' || a.id, jsonb_build_object('announcement_id', a.id)
    from public.profiles p
    where p.id <> auth.uid() and public._membership_state(p.id) in ('active', 'canceling', 'past_due_grace');
    get diagnostics notified = row_count;
    update public.announcements set notified_at = now() where id = a.id;
  end if;
  return notified;
end;
$$;

-- Admin dashboard figures (computed from real data).
create or replace function public.admin_overview_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Kun administratorer' using errcode = '42501';
  end if;
  with members as (
    select p.id, public._membership_state(p.id) as state
    from public.profiles p
    where not public._is_admin_user(p.id)
  )
  select jsonb_build_object(
    'total_members', (select count(*) from members),
    'active', (select count(*) from members where state = 'active'),
    'canceling', (select count(*) from members where state = 'canceling'),
    'past_due', (select count(*) from members where state in ('past_due_grace', 'past_due')),
    'pending', (select count(*) from members where state = 'pending'),
    'new_onboarding', (select count(*) from public.onboarding_submissions o where o.status = 'submitted'),
    'plans_awaiting', (
      select count(*) from members m
      where m.state in ('active', 'canceling', 'past_due_grace')
        and exists (select 1 from public.onboarding_submissions o where o.user_id = m.id and o.status in ('submitted', 'reviewed'))
        and not exists (select 1 from public.training_plans t where t.member_id = m.id and t.status = 'published')
    ),
    'unanswered_conversations', (
      select count(*) from public.conversation_participants me
      join public.conversations c on c.id = me.conversation_id
      where me.user_id = auth.uid()
        and exists (
          select 1 from public.private_messages m
          where m.conversation_id = c.id and m.sender_id is distinct from auth.uid()
            and m.created_at > me.last_read_at and m.deleted_at is null
        )
    ),
    'open_reports', (select count(*) from public.reports r where r.status = 'open'),
    'pending_data_requests', (select count(*) from public.data_requests d where d.status = 'pending'),
    'unread_notifications', (select count(*) from public.notifications n where n.user_id = auth.uid() and n.read_at is null),
    'nutrition_without_plan', (
      select count(distinct pu.user_id) from public.purchases pu
      join public.products pr on pr.id = pu.product_id and pr.slug = 'kostplan'
      where pu.status in ('paid', 'granted')
        and not exists (select 1 from public.nutrition_plans np where np.member_id = pu.user_id and np.status = 'published')
    )
  ) into result;
  return result;
end;
$$;

-- Searchable member list for administrators.
create or replace function public.admin_member_list(p_search text default null)
returns table (
  id uuid,
  full_name text,
  email text,
  avatar_path text,
  created_at timestamptz,
  membership_state text,
  onboarding_status text,
  has_published_plan boolean,
  has_nutrition boolean,
  community_suspended boolean,
  is_admin boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Kun administratorer' using errcode = '42501';
  end if;
  return query
  select
    p.id,
    p.full_name,
    pp.email,
    p.avatar_path,
    p.created_at,
    public._membership_state(p.id),
    p.onboarding_status,
    exists (select 1 from public.training_plans t where t.member_id = p.id and t.status = 'published'),
    public._has_addon(p.id, 'kostplan'),
    p.community_suspended,
    public._is_admin_user(p.id)
  from public.profiles p
  left join public.profile_private pp on pp.user_id = p.id
  where p_search is null or p_search = ''
     or p.full_name ilike '%' || p_search || '%'
     or pp.email ilike '%' || p_search || '%'
  order by p.created_at desc
  limit 500;
end;
$$;

-- Internal: post the community welcome message once per member (called by the
-- payment webhook when a membership becomes active for the first time).
create or replace function public._post_community_welcome(p_user uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  settings record;
  first_name text;
begin
  if exists (select 1 from public.profiles where id = p_user and welcomed_at is not null) then
    return false;
  end if;
  select * into settings from public.site_settings where id = 1;
  select split_part(coalesce(nullif(full_name, ''), 'nyt medlem'), ' ', 1) into first_name
  from public.profiles where id = p_user;
  insert into public.community_messages (author_id, body, is_system)
  values (settings.coach_user_id, replace(settings.community_welcome_message, '{navn}', coalesce(first_name, 'nyt medlem')), true);
  update public.profiles set welcomed_at = now() where id = p_user;
  return true;
end;
$$;

-- Bootstrap the first administrator (run from the SQL editor or with the
-- service role). Never callable by ordinary clients.
create or replace function public.bootstrap_admin(p_email text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then
    raise exception 'Ingen bruger med e-mail %. Opret kontoen på siden først.', p_email;
  end if;
  insert into public.user_roles (user_id, role) values (uid, 'admin') on conflict do nothing;
  update public.site_settings set coach_user_id = coalesce(coach_user_id, uid) where id = 1;
  return uid;
end;
$$;

-- =============================================================================
-- Function privileges: internal helpers are not callable through the API.
-- =============================================================================

-- Postgres lets PUBLIC execute every new function, so revoking only from anon
-- (as before) had no effect: visitors could call membership_state(),
-- membership_summary() and every other RPC. Start from "logged-in users and
-- the server only"; the lines below narrow it further. Later migrations must
-- revoke from public/anon for their own functions (tests/db checks this).
-- (Fix found by tests/db.)
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

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table public.site_settings enable row level security;
alter table public.admin_settings enable row level security;
alter table public.products enable row level security;
alter table public.user_roles enable row level security;
alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.billing_customers enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payment_events enable row level security;
alter table public.purchases enable row level security;
alter table public.rate_limits enable row level security;
alter table public.notifications enable row level security;
alter table public.onboarding_submissions enable row level security;
alter table public.media enable row level security;
alter table public.training_plans enable row level security;
alter table public.training_sessions enable row level security;
alter table public.exercises enable row level security;
alter table public.workout_completions enable row level security;
alter table public.nutrition_plans enable row level security;
alter table public.nutrition_meals enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_media enable row level security;
alter table public.community_messages enable row level security;
alter table public.community_reads enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.private_messages enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.data_requests enable row level security;
alter table public.contact_messages enable row level security;

-- Visitors get read access to public settings and products only.
revoke all on all tables in schema public from anon;
grant select on public.site_settings to anon;
grant select on public.products to anon;

-- Settings
create policy "site_settings: everyone can read" on public.site_settings
  for select to anon, authenticated using (true);
create policy "site_settings: admins update" on public.site_settings
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "admin_settings: admins read" on public.admin_settings
  for select to authenticated using ((select public.is_admin()));
create policy "admin_settings: admins update" on public.admin_settings
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Products
create policy "products: active are public" on public.products
  for select to anon, authenticated using (is_active or (select public.is_admin()));
create policy "products: admins insert" on public.products
  for insert to authenticated with check ((select public.is_admin()));
create policy "products: admins update" on public.products
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "products: admins delete" on public.products
  for delete to authenticated using ((select public.is_admin()));

-- Roles: readable by the user themself and admins; only admins change roles.
create policy "user_roles: read own or admin" on public.user_roles
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "user_roles: admins insert" on public.user_roles
  for insert to authenticated with check ((select public.is_admin()));
create policy "user_roles: admins delete" on public.user_roles
  for delete to authenticated using ((select public.is_admin()));

-- Profiles: own, the coach, admins, and fellow entitled members.
create policy "profiles: read" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or is_coach or (select public.is_admin()) or (select public.is_entitled()));
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles: admins update" on public.profiles
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "profile_private: read own or admin" on public.profile_private
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "profile_private: update own" on public.profile_private
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Billing: read own / admin. Writes only by the server (service role).
create policy "billing_customers: read own or admin" on public.billing_customers
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "subscriptions: read own or admin" on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "payment_events: admins read" on public.payment_events
  for select to authenticated using ((select public.is_admin()));
create policy "purchases: read own or admin" on public.purchases
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));

-- rate_limits: no policies (server/definer functions only).

-- Notifications
create policy "notifications: read own" on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
create policy "notifications: update own" on public.notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notifications: delete own" on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

-- Onboarding
create policy "onboarding: read own or admin" on public.onboarding_submissions
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "onboarding: insert own when entitled" on public.onboarding_submissions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_entitled()));
create policy "onboarding: update own when entitled" on public.onboarding_submissions
  for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_entitled()))
  with check (user_id = (select auth.uid()) and (select public.is_entitled()));
create policy "onboarding: admins update" on public.onboarding_submissions
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Media
create policy "media: entitled read" on public.media
  for select to authenticated
  using ((select public.is_admin()) or (bucket in ('announcements', 'training-media') and (select public.is_entitled())));
create policy "media: admins insert" on public.media
  for insert to authenticated with check ((select public.is_admin()));
create policy "media: admins update" on public.media
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "media: admins delete" on public.media
  for delete to authenticated using ((select public.is_admin()));

-- Training plans: members read their own published/archived plans; admins manage.
create policy "training_plans: read" on public.training_plans
  for select to authenticated
  using ((select public.is_admin())
         or (member_id = (select auth.uid()) and status <> 'draft' and (select public.is_entitled())));
create policy "training_plans: admins insert" on public.training_plans
  for insert to authenticated with check ((select public.is_admin()));
create policy "training_plans: admins update" on public.training_plans
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "training_plans: admins delete" on public.training_plans
  for delete to authenticated using ((select public.is_admin()));

create policy "training_sessions: read" on public.training_sessions
  for select to authenticated
  using ((select public.is_admin()) or exists (
    select 1 from public.training_plans p
    where p.id = plan_id and p.member_id = (select auth.uid()) and p.status <> 'draft' and (select public.is_entitled())
  ));
create policy "training_sessions: admins insert" on public.training_sessions
  for insert to authenticated with check ((select public.is_admin()));
create policy "training_sessions: admins update" on public.training_sessions
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "training_sessions: admins delete" on public.training_sessions
  for delete to authenticated using ((select public.is_admin()));

create policy "exercises: read" on public.exercises
  for select to authenticated
  using ((select public.is_admin()) or exists (
    select 1 from public.training_sessions s
    join public.training_plans p on p.id = s.plan_id
    where s.id = session_id and p.member_id = (select auth.uid()) and p.status <> 'draft' and (select public.is_entitled())
  ));
create policy "exercises: admins insert" on public.exercises
  for insert to authenticated with check ((select public.is_admin()));
create policy "exercises: admins update" on public.exercises
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "exercises: admins delete" on public.exercises
  for delete to authenticated using ((select public.is_admin()));

create policy "workout_completions: read own or admin" on public.workout_completions
  for select to authenticated using (member_id = (select auth.uid()) or (select public.is_admin()));
create policy "workout_completions: insert own on published plan" on public.workout_completions
  for insert to authenticated
  with check (
    member_id = (select auth.uid())
    and (select public.is_entitled())
    and exists (
      select 1 from public.training_sessions s
      join public.training_plans p on p.id = s.plan_id
      where s.id = session_id and p.member_id = (select auth.uid()) and p.status = 'published'
    )
  );
create policy "workout_completions: delete own" on public.workout_completions
  for delete to authenticated using (member_id = (select auth.uid()));

-- Nutrition plans
create policy "nutrition_plans: read" on public.nutrition_plans
  for select to authenticated
  using ((select public.is_admin())
         or (member_id = (select auth.uid()) and status <> 'draft' and (select public.is_entitled())));
create policy "nutrition_plans: admins insert" on public.nutrition_plans
  for insert to authenticated with check ((select public.is_admin()));
create policy "nutrition_plans: admins update" on public.nutrition_plans
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "nutrition_plans: admins delete" on public.nutrition_plans
  for delete to authenticated using ((select public.is_admin()));

create policy "nutrition_meals: read" on public.nutrition_meals
  for select to authenticated
  using ((select public.is_admin()) or exists (
    select 1 from public.nutrition_plans p
    where p.id = plan_id and p.member_id = (select auth.uid()) and p.status <> 'draft' and (select public.is_entitled())
  ));
create policy "nutrition_meals: admins insert" on public.nutrition_meals
  for insert to authenticated with check ((select public.is_admin()));
create policy "nutrition_meals: admins update" on public.nutrition_meals
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "nutrition_meals: admins delete" on public.nutrition_meals
  for delete to authenticated using ((select public.is_admin()));

-- Announcements: entitled members read published ones; only admins write.
create policy "announcements: read" on public.announcements
  for select to authenticated
  using ((select public.is_admin())
         or (status = 'published' and published_at <= now() and (select public.is_entitled())));
create policy "announcements: admins insert" on public.announcements
  for insert to authenticated with check ((select public.is_admin()));
create policy "announcements: admins update" on public.announcements
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "announcements: admins delete" on public.announcements
  for delete to authenticated using ((select public.is_admin()));

create policy "announcement_media: read" on public.announcement_media
  for select to authenticated
  using ((select public.is_admin()) or exists (
    select 1 from public.announcements a
    where a.id = announcement_id and a.status = 'published' and a.published_at <= now() and (select public.is_entitled())
  ));
create policy "announcement_media: admins insert" on public.announcement_media
  for insert to authenticated with check ((select public.is_admin()));
create policy "announcement_media: admins update" on public.announcement_media
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "announcement_media: admins delete" on public.announcement_media
  for delete to authenticated using ((select public.is_admin()));

-- Community
create policy "community_messages: read" on public.community_messages
  for select to authenticated
  using ((select public.is_admin()) or (hidden_at is null and (select public.can_use_community())));
create policy "community_messages: insert own" on public.community_messages
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and not is_system
    and hidden_at is null
    and deleted_at is null
    and (select public.can_use_community())
    and (image_path is null or split_part(image_path, '/', 1) = (select auth.uid())::text)
  );
create policy "community_messages: update own" on public.community_messages
  for update to authenticated
  using (author_id = (select auth.uid()) and (select public.can_use_community()))
  with check (author_id = (select auth.uid()));
create policy "community_messages: admins update" on public.community_messages
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "community_messages: admins delete" on public.community_messages
  for delete to authenticated using ((select public.is_admin()));

create policy "community_reads: own" on public.community_reads
  for select to authenticated using (user_id = (select auth.uid()));

-- Conversations: participants only. Created through get_or_create_direct_conversation().
create policy "conversations: participants read" on public.conversations
  for select to authenticated using ((select public.is_conversation_participant(id)));
create policy "conversation_participants: participants read" on public.conversation_participants
  for select to authenticated using ((select public.is_conversation_participant(conversation_id)));
create policy "private_messages: participants read" on public.private_messages
  for select to authenticated using ((select public.is_conversation_participant(conversation_id)));
create policy "private_messages: participants send" on public.private_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and deleted_at is null
    and (select public.can_send_private_message(conversation_id))
  );
create policy "private_messages: sender soft-deletes" on public.private_messages
  for update to authenticated using (sender_id = (select auth.uid())) with check (sender_id = (select auth.uid()));

-- Reports: created via report_content(); reporters see their own, admins all.
create policy "reports: read own or admin" on public.reports
  for select to authenticated using (reporter_id = (select auth.uid()) or (select public.is_admin()));
create policy "reports: admins update" on public.reports
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "moderation_actions: admins read" on public.moderation_actions
  for select to authenticated using ((select public.is_admin()));

-- Data requests
create policy "data_requests: read own or admin" on public.data_requests
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy "data_requests: insert own" on public.data_requests
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "data_requests: update own or admin" on public.data_requests
  for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check (user_id = (select auth.uid()) or (select public.is_admin()));

-- Contact messages: inserted by the server after validation and rate limiting.
create policy "contact_messages: admins read" on public.contact_messages
  for select to authenticated using ((select public.is_admin()));
create policy "contact_messages: admins update" on public.contact_messages
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- =============================================================================
-- Realtime (postgres_changes honours the RLS policies above)
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;
do $$
declare
  t text;
begin
  foreach t in array array['community_messages', 'private_messages', 'notifications'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
