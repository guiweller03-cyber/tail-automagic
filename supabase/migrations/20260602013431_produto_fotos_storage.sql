alter table produtos
add column if not exists foto_url text,
add column if not exists foto_path text;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'produto-fotos',
  'produto-fotos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'produto_fotos_select'
  ) then
    create policy "produto_fotos_select"
      on storage.objects
      for select
      to anon, authenticated
      using (bucket_id = 'produto-fotos');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'produto_fotos_insert'
  ) then
    create policy "produto_fotos_insert"
      on storage.objects
      for insert
      to anon, authenticated
      with check (bucket_id = 'produto-fotos');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'produto_fotos_update'
  ) then
    create policy "produto_fotos_update"
      on storage.objects
      for update
      to anon, authenticated
      using (bucket_id = 'produto-fotos')
      with check (bucket_id = 'produto-fotos');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'produto_fotos_delete'
  ) then
    create policy "produto_fotos_delete"
      on storage.objects
      for delete
      to anon, authenticated
      using (bucket_id = 'produto-fotos');
  end if;
end $$;
