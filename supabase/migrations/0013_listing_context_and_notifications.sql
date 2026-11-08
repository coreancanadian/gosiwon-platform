-- ============================================================================
-- 1. Support messages remember which listing the person was viewing.
-- 2. The admin can see every inquiry a member has made, for context.
-- 3. New sign-ups and messages notify the operator by email.
--
-- Written to be re-runnable (safe to paste into the SQL Editor twice).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Listing context
-- ---------------------------------------------------------------------------
alter table public.support_messages
  add column if not exists property_id uuid
    references public.properties(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2. Admin reads inquiries (the rows only: message bodies stay party-only)
-- ---------------------------------------------------------------------------
drop policy if exists "admin reads all inquiries" on public.inquiries;
create policy "admin reads all inquiries" on public.inquiries
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Notifications. Triggers rather than app code, because sign-up happens in
-- the browser directly against Supabase Auth: the database is the one place
-- that sees every new account and message, whatever path created them.
--
-- The row carries only a type and an id. /api/webhooks/notify looks up the
-- details itself, so nothing personal sits in the request queue.
-- ---------------------------------------------------------------------------
create extension if not exists pg_net;

-- Not exposed through the API: PostgREST only serves the public schema.
create schema if not exists private;

create table if not exists private.notify_settings (
  id             boolean primary key default true check (id),
  webhook_url    text not null,
  webhook_secret text not null
);

create or replace function private.notify_operator()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  cfg private.notify_settings;
begin
  select * into cfg from private.notify_settings where id;
  if found then
    perform net.http_post(
      url := cfg.webhook_url,
      body := jsonb_build_object('type', tg_argv[0], 'id', new.id),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', cfg.webhook_secret
      ),
      timeout_milliseconds := 10000
    );
  end if;
  return new;
exception when others then
  -- A notification must never block a sign-up or a message.
  return new;
end;
$$;

drop trigger if exists notify_operator_signup on public.profiles;
create trigger notify_operator_signup
  after insert on public.profiles
  for each row execute function private.notify_operator('signup');

drop trigger if exists notify_operator_message on public.messages;
create trigger notify_operator_message
  after insert on public.messages
  for each row execute function private.notify_operator('message');

drop trigger if exists notify_operator_support on public.support_messages;
create trigger notify_operator_support
  after insert on public.support_messages
  for each row execute function private.notify_operator('support_message');
