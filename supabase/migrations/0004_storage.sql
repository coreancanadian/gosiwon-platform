-- ============================================================================
-- Storage bucket for listing photos.
--
-- Path convention: <property_id>/<uuid>.<ext>
-- The first path segment is the property id, which is what the policies below
-- check ownership against.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('property-images', 'property-images', true)
on conflict (id) do nothing;

-- Anyone may view listing photos (the bucket is public and listings are public).
create policy "listing photos are public"
  on storage.objects for select
  using (bucket_id = 'property-images');

-- Only the owning host may add, replace, or remove photos for their property.
create policy "host uploads own listing photos"
  on storage.objects for insert
  with check (
    bucket_id = 'property-images'
    and exists (
      select 1 from public.properties p
       where p.owner_id = auth.uid()
         and p.id::text = (storage.foldername(name))[1]
    )
  );

create policy "host updates own listing photos"
  on storage.objects for update
  using (
    bucket_id = 'property-images'
    and exists (
      select 1 from public.properties p
       where p.owner_id = auth.uid()
         and p.id::text = (storage.foldername(name))[1]
    )
  );

create policy "host deletes own listing photos"
  on storage.objects for delete
  using (
    bucket_id = 'property-images'
    and exists (
      select 1 from public.properties p
       where p.owner_id = auth.uid()
         and p.id::text = (storage.foldername(name))[1]
    )
  );
