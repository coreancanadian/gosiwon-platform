-- ============================================================================
-- Support channel: one private thread per user with the Campusflat admin.
--
-- Hosts send their 사업자등록증 here, and anyone can reach the operator.
-- Documents are personal data (business number, representative's name), so
-- the storage bucket is PRIVATE and readable only by the thread's owner and
-- an admin. Written to be re-runnable (safe to paste into the SQL Editor twice).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Admin check. SECURITY DEFINER so policies on other tables can call it
-- without recursing through profiles' own RLS.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'admin'
  );
$$;

-- The inbox needs to show who each thread belongs to.
drop policy if exists "admin reads all profiles" on public.profiles;
create policy "admin reads all profiles" on public.profiles
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.support_threads (
  id              uuid primary key default uuid_generate_v4(),
  -- One thread per user: every conversation with the operator lives in one place.
  user_id         uuid not null unique references public.profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  -- Kept current by the trigger below; cleared by mark_support_read().
  admin_unread    boolean not null default false,
  user_unread     boolean not null default false
);

create table if not exists public.support_messages (
  id              uuid primary key default uuid_generate_v4(),
  thread_id       uuid not null references public.support_threads(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  body            text not null default '' check (char_length(body) <= 4000),
  -- Object path inside the support-attachments bucket: <thread owner id>/<uuid>.<ext>
  attachment_path text,
  -- Original filename, for display only (the stored key is a plain uuid).
  attachment_name text,
  created_at      timestamptz not null default now(),
  check (char_length(body) > 0 or attachment_path is not null)
);

create index if not exists support_messages_thread_idx
  on public.support_messages (thread_id, created_at);
create index if not exists support_threads_inbox_idx
  on public.support_threads (last_message_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.support_threads  enable row level security;
alter table public.support_messages enable row level security;

drop policy if exists "support thread visible to owner and admin" on public.support_threads;
create policy "support thread visible to owner and admin" on public.support_threads
  for select using (user_id = auth.uid() or public.is_admin());

-- Users open their own thread only. Admins reply inside existing threads.
drop policy if exists "user opens own support thread" on public.support_threads;
create policy "user opens own support thread" on public.support_threads
  for insert with check (user_id = auth.uid());

drop policy if exists "support messages visible to owner and admin" on public.support_messages;
create policy "support messages visible to owner and admin" on public.support_messages
  for select using (
    exists (
      select 1 from public.support_threads t
       where t.id = thread_id
         and (t.user_id = auth.uid() or public.is_admin())
    )
  );

-- sender_id is pinned to the caller, so nobody can post as the admin.
drop policy if exists "owner and admin send support messages" on public.support_messages;
create policy "owner and admin send support messages" on public.support_messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.support_threads t
       where t.id = thread_id
         and (t.user_id = auth.uid() or public.is_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- Keep thread ordering and unread flags in step with new messages. Runs as
-- the table owner so neither side needs an UPDATE policy on threads.
-- ---------------------------------------------------------------------------
create or replace function public.bump_support_thread()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.support_threads t
     set last_message_at = new.created_at,
         admin_unread    = (new.sender_id = t.user_id),
         user_unread     = (new.sender_id <> t.user_id)
   where t.id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists support_message_bump on public.support_messages;
create trigger support_message_bump
  after insert on public.support_messages
  for each row execute function public.bump_support_thread();

-- Opening a thread clears the caller's own unread flag — nobody else's.
create or replace function public.mark_support_read(p_thread_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if public.is_admin() then
    update public.support_threads set admin_unread = false where id = p_thread_id;
  else
    update public.support_threads set user_unread = false
     where id = p_thread_id and user_id = auth.uid();
  end if;
end;
$$;

revoke all on function public.mark_support_read(uuid) from public;
grant execute on function public.mark_support_read(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Private storage for attachments. Path convention: <thread owner id>/<uuid>.<ext>
-- The first segment is what the policies check, so a user can only ever touch
-- their own folder; an admin can reach every folder.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "support attachments readable by owner and admin" on storage.objects;
create policy "support attachments readable by owner and admin"
  on storage.objects for select
  using (
    bucket_id = 'support-attachments'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "support attachments uploaded by owner and admin" on storage.objects;
create policy "support attachments uploaded by owner and admin"
  on storage.objects for insert
  with check (
    bucket_id = 'support-attachments'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
