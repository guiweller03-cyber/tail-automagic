-- Bucket permanente para comprovantes de pagamento recebidos no WhatsApp.
-- A midia da UazAPI/WhatsApp expira em poucos dias; copiamos a imagem/PDF para
-- ca assim que chega, para nunca mais perder o comprovante (exibir no chat e
-- reanalisar quando necessario).
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'comprovantes',
  'comprovantes',
  true,
  20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
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
      and policyname = 'comprovantes_select'
  ) then
    create policy "comprovantes_select"
      on storage.objects
      for select
      to anon, authenticated
      using (bucket_id = 'comprovantes');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'comprovantes_insert'
  ) then
    create policy "comprovantes_insert"
      on storage.objects
      for insert
      to anon, authenticated
      with check (bucket_id = 'comprovantes');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'comprovantes_update'
  ) then
    create policy "comprovantes_update"
      on storage.objects
      for update
      to anon, authenticated
      using (bucket_id = 'comprovantes')
      with check (bucket_id = 'comprovantes');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'comprovantes_delete'
  ) then
    create policy "comprovantes_delete"
      on storage.objects
      for delete
      to anon, authenticated
      using (bucket_id = 'comprovantes');
  end if;
end $$;
