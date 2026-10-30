-- =============================================================================
-- Stærk50 – RESET (wipes the app database so supabase/setup.sql can run cleanly)
--
-- ⚠️  This permanently deletes ALL tables, views, functions and types in the
--     "public" schema, every storage policy, and the custom triggers on
--     auth.users (these are hidden from the Table Editor and are a common
--     leftover from earlier experiments or Supabase starter templates).
--
-- It does NOT delete: user accounts (auth.users), uploaded files or storage
-- buckets. setup.sql re-uses existing buckets with the same names.
--
-- Run in Supabase → SQL Editor, then run supabase/setup.sql.
-- =============================================================================

do $$
declare
  r record;
begin
  -- 1. Custom triggers on auth.users (e.g. "on_auth_user_created").
  for r in
    select t.tgname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal
  loop
    execute format('drop trigger if exists %I on auth.users', r.tgname);
    raise notice 'Dropped trigger % on auth.users', r.tgname;
  end loop;

  -- 2. Storage policies on storage.objects and storage.buckets.
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'storage' and tablename in ('objects', 'buckets')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    raise notice 'Dropped storage policy %', r.policyname;
  end loop;

  -- 3. Views and tables in public (cascade also removes their policies,
  --    triggers and realtime publication membership).
  for r in select viewname from pg_views where schemaname = 'public' loop
    execute format('drop view if exists public.%I cascade', r.viewname);
  end loop;
  for r in select matviewname from pg_matviews where schemaname = 'public' loop
    execute format('drop materialized view if exists public.%I cascade', r.matviewname);
  end loop;
  for r in
    select c.relname as tablename
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
  loop
    execute format('drop table if exists public.%I cascade', r.tablename);
    raise notice 'Dropped table public.%', r.tablename;
  end loop;

  -- 4. Functions in public that do not belong to an extension.
  for r in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('drop function if exists %s cascade', r.signature);
  end loop;

  -- 5. Custom types (enums etc.) in public that do not belong to an extension.
  for r in
    select t.typname
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typtype in ('e', 'd', 'c')
      and not exists (select 1 from pg_class c where c.oid = t.typrelid and c.relkind <> 'c')
      and not exists (select 1 from pg_depend d where d.objid = t.oid and d.deptype = 'e')
  loop
    execute format('drop type if exists public.%I cascade', r.typname);
  end loop;
end;
$$;

-- Done. Now run supabase/setup.sql.
