-- =============================================================================
-- Stærk50 – storage buckets and access policies
-- Every bucket except "site" is private: files are only reachable through
-- short-lived signed URLs for users the policies below allow.
-- Note: the Supabase Free plan caps any single upload at 50 MB.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 5242880,
    array['image/jpeg', 'image/png', 'image/webp']),
  ('community', 'community', false, 10485760,
    array['image/jpeg', 'image/png', 'image/webp']),
  ('announcements', 'announcements', false, 52428800,
    array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']),
  ('training-media', 'training-media', false, 52428800,
    array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']),
  -- Public marketing images (coach photo, logo, hero image). Admin-managed.
  ('site', 'site', true, 10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Avatars: path "<user id>/<file>". Visible to logged-in members; owner writes.
create policy "avatars: members read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = (select auth.uid())::text
         or (select public.is_admin()) or (select public.is_entitled()))
  );
create policy "avatars: owner uploads" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: owner updates" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: owner or admin deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));

-- Community images: path "<user id>/<file>".
create policy "community: members read" on storage.objects
  for select to authenticated
  using (bucket_id = 'community' and (select public.can_use_community()));
create policy "community: members upload own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'community'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.can_use_community())
  );
create policy "community: owner or admin deletes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'community' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));

-- Announcements and training media: admins write, entitled members read.
create policy "announcements: entitled read" on storage.objects
  for select to authenticated
  using (bucket_id = 'announcements' and (select public.is_entitled()));
create policy "announcements: admins upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'announcements' and (select public.is_admin()));
create policy "announcements: admins update" on storage.objects
  for update to authenticated
  using (bucket_id = 'announcements' and (select public.is_admin()))
  with check (bucket_id = 'announcements' and (select public.is_admin()));
create policy "announcements: admins delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'announcements' and (select public.is_admin()));

create policy "training-media: entitled read" on storage.objects
  for select to authenticated
  using (bucket_id = 'training-media' and (select public.is_entitled()));
create policy "training-media: admins upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'training-media' and (select public.is_admin()));
create policy "training-media: admins update" on storage.objects
  for update to authenticated
  using (bucket_id = 'training-media' and (select public.is_admin()))
  with check (bucket_id = 'training-media' and (select public.is_admin()));
create policy "training-media: admins delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'training-media' and (select public.is_admin()));

-- Site images: public read through the public URL; admins write.
create policy "site: admins upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site' and (select public.is_admin()));
create policy "site: admins update" on storage.objects
  for update to authenticated
  using (bucket_id = 'site' and (select public.is_admin()))
  with check (bucket_id = 'site' and (select public.is_admin()));
create policy "site: admins delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'site' and (select public.is_admin()));
