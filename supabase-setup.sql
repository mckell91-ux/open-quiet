create extension if not exists pgcrypto with schema extensions;

create table if not exists public.feelings (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(trim(text)) between 2 and 700),
  mood text not null check (mood in ('heavy', 'angry', 'lonely', 'hopeful')),
  created_at timestamptz not null default now(),
  reported_count integer not null default 0 check (reported_count >= 0),
  comfort_count integer not null default 0 check (comfort_count >= 0),
  hidden boolean not null default false,
  approved boolean not null default true,
  client_token_hash text not null
);

create table if not exists public.feeling_actions (
  id uuid primary key default gen_random_uuid(),
  feeling_id uuid not null references public.feelings(id) on delete cascade,
  action_type text not null check (action_type in ('report', 'comfort')),
  comfort_phrase text,
  client_token_hash text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists one_report_per_client_per_feeling
on public.feeling_actions (feeling_id, client_token_hash)
where action_type = 'report';

create unique index if not exists one_comfort_phrase_per_client_per_feeling
on public.feeling_actions (feeling_id, client_token_hash, comfort_phrase)
where action_type = 'comfort';

create index if not exists feelings_created_at_desc
on public.feelings (created_at desc);

create index if not exists feelings_reported_count_desc
on public.feelings (reported_count desc);

alter table public.feelings enable row level security;
alter table public.feeling_actions enable row level security;

drop policy if exists "Read approved visible feelings" on public.feelings;
create policy "Read approved visible feelings"
on public.feelings
for select
to anon
using (approved = true and hidden = false);

drop policy if exists "No public action reads" on public.feeling_actions;
create policy "No public action reads"
on public.feeling_actions
for select
to anon
using (false);

create or replace function public.hash_client_token(client_token text)
returns text
language sql
stable
as $$
  select encode(extensions.digest(coalesce(client_token, ''), 'sha256'), 'hex');
$$;

create or replace function public.submit_feeling(
  feeling_text text,
  feeling_mood text,
  client_token text
)
returns public.feelings
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_text text := trim(feeling_text);
  token_hash text := public.hash_client_token(client_token);
  new_row public.feelings;
begin
  if char_length(clean_text) < 2 or char_length(clean_text) > 700 then
    raise exception 'Please keep shared feelings between 2 and 700 characters.';
  end if;

  if feeling_mood not in ('heavy', 'angry', 'lonely', 'hopeful') then
    raise exception 'Please choose a valid mood.';
  end if;

  if client_token is null or char_length(client_token) < 12 then
    raise exception 'Could not verify this browser. Please refresh and try again.';
  end if;

  if exists (
    select 1
    from public.feelings
    where client_token_hash = token_hash
      and created_at > now() - interval '1 minute'
  ) then
    raise exception 'Please wait a minute before sharing another feeling.';
  end if;

  insert into public.feelings (text, mood, client_token_hash)
  values (clean_text, feeling_mood, token_hash)
  returning * into new_row;

  return new_row;
end;
$$;

create or replace function public.report_feeling(
  target_feeling_id uuid,
  client_token text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  token_hash text := public.hash_client_token(client_token);
begin
  if client_token is null or char_length(client_token) < 12 then
    raise exception 'Could not verify this browser. Please refresh and try again.';
  end if;

  with inserted as (
    insert into public.feeling_actions (feeling_id, action_type, client_token_hash)
    values (target_feeling_id, 'report', token_hash)
    on conflict do nothing
    returning public.feeling_actions.feeling_id
  )
  update public.feelings
  set
    reported_count = public.feelings.reported_count + 1,
    -- Auto-hide public posts after 3 unique reports.
    hidden = case when public.feelings.reported_count + 1 >= 3 then true else public.feelings.hidden end
  where public.feelings.id = target_feeling_id
    and exists (select 1 from inserted);
end;
$$;

drop function if exists public.send_comfort(uuid, text, text);
drop function if exists public.send_comfort(text, text, uuid);

create or replace function public.send_comfort(
  client_token text,
  selected_comfort_phrase text,
  target_feeling_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  token_hash text := public.hash_client_token(client_token);
begin
  if selected_comfort_phrase not in ('You''re not alone.', 'I hear you.', 'That sounds heavy.') then
    raise exception 'Please choose one of the available comfort messages.';
  end if;

  if client_token is null or char_length(client_token) < 12 then
    raise exception 'Could not verify this browser. Please refresh and try again.';
  end if;

  with inserted as (
    insert into public.feeling_actions (feeling_id, action_type, comfort_phrase, client_token_hash)
    values (target_feeling_id, 'comfort', selected_comfort_phrase, token_hash)
    on conflict do nothing
    returning public.feeling_actions.feeling_id
  )
  update public.feelings
  set comfort_count = public.feelings.comfort_count + 1
  where public.feelings.id = target_feeling_id
    and exists (select 1 from inserted);
end;
$$;

revoke all on public.feelings from anon, authenticated;
revoke all on public.feeling_actions from anon, authenticated;
grant select on public.feelings to anon;
grant execute on function public.submit_feeling(text, text, text) to anon;
grant execute on function public.report_feeling(uuid, text) to anon;
grant execute on function public.send_comfort(text, text, uuid) to anon;
