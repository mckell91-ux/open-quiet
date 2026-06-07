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

delete from public.feeling_actions
where public.feeling_actions.id in (
  select duplicate_actions.id
  from (
    select
      public.feeling_actions.id,
      row_number() over (
        partition by public.feeling_actions.feeling_id, public.feeling_actions.client_token_hash
        order by public.feeling_actions.created_at, public.feeling_actions.id
      ) as duplicate_number
    from public.feeling_actions
    where public.feeling_actions.action_type = 'report'
  ) as duplicate_actions
  where duplicate_actions.duplicate_number > 1
);

delete from public.feeling_actions
where public.feeling_actions.id in (
  select duplicate_actions.id
  from (
    select
      public.feeling_actions.id,
      row_number() over (
        partition by public.feeling_actions.feeling_id, public.feeling_actions.client_token_hash, public.feeling_actions.comfort_phrase
        order by public.feeling_actions.created_at, public.feeling_actions.id
      ) as duplicate_number
    from public.feeling_actions
    where public.feeling_actions.action_type = 'comfort'
  ) as duplicate_actions
  where duplicate_actions.duplicate_number > 1
);

update public.feelings
set comfort_count = coalesce(comfort_totals.total, 0)
from (
  select
    public.feelings.id as feeling_id,
    count(public.feeling_actions.id)::integer as total
  from public.feelings
  left join public.feeling_actions
    on public.feeling_actions.feeling_id = public.feelings.id
    and public.feeling_actions.action_type = 'comfort'
  group by public.feelings.id
) as comfort_totals
where public.feelings.id = comfort_totals.feeling_id;

create unique index if not exists one_report_per_client_per_feeling
on public.feeling_actions (feeling_id, client_token_hash)
where action_type = 'report';

create unique index if not exists one_comfort_phrase_per_client_per_feeling
on public.feeling_actions (feeling_id, client_token_hash, comfort_phrase)
where action_type = 'comfort';

create index if not exists feelings_created_at_desc
on public.feelings (created_at desc);

create index if not exists feelings_public_created_at_desc
on public.feelings (created_at desc)
where approved = true and hidden = false;

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

drop function if exists public.submit_feeling(text, text, text);
drop function if exists public.hash_client_token(text) cascade;

create or replace function public.hash_client_token(p_client_token text)
returns text
language sql
stable
as $$
  select encode(extensions.digest(coalesce(p_client_token, ''), 'sha256'), 'hex');
$$;

drop function if exists public.comfort_phrase_counts(uuid);

create or replace function public.comfort_phrase_counts(p_feeling_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(phrase_counts.comfort_phrase, phrase_counts.total), '{}'::jsonb)
  from (
    select
      public.feeling_actions.comfort_phrase,
      count(*)::integer as total
    from public.feeling_actions
    where public.feeling_actions.feeling_id = p_feeling_id
      and public.feeling_actions.action_type = 'comfort'
      and public.feeling_actions.comfort_phrase is not null
    group by public.feeling_actions.comfort_phrase
  ) as phrase_counts;
$$;

drop function if exists public.get_public_stats();

create or replace function public.get_public_stats()
returns table(total_feelings integer, total_comforts integer, feelings_today integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(public.feelings.id)::integer as total_feelings,
    coalesce(sum(public.feelings.comfort_count), 0)::integer as total_comforts,
    count(public.feelings.id) filter (
      where public.feelings.created_at >= date_trunc('day', now())
    )::integer as feelings_today
  from public.feelings
  where public.feelings.approved = true
    and public.feelings.hidden = false;
$$;

drop function if exists public.list_public_feelings(integer, integer, text);

create or replace function public.list_public_feelings(
  p_limit integer default 18,
  p_offset integer default 0,
  p_mood text default null
)
returns table(
  id uuid,
  text text,
  mood text,
  created_at timestamptz,
  reported_count integer,
  comfort_count integer,
  comfort_phrase_counts jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    public.feelings.id,
    public.feelings.text,
    public.feelings.mood,
    public.feelings.created_at,
    public.feelings.reported_count,
    public.feelings.comfort_count,
    public.comfort_phrase_counts(public.feelings.id) as comfort_phrase_counts
  from public.feelings
  where public.feelings.approved = true
    and public.feelings.hidden = false
    and (p_mood is null or p_mood = 'all' or public.feelings.mood = p_mood)
  order by public.feelings.created_at desc
  limit greatest(1, least(coalesce(p_limit, 18), 40))
  offset greatest(0, coalesce(p_offset, 0));
$$;

drop function if exists public.random_public_feeling();

create or replace function public.random_public_feeling()
returns table(
  id uuid,
  text text,
  mood text,
  created_at timestamptz,
  reported_count integer,
  comfort_count integer,
  comfort_phrase_counts jsonb
)
language sql
volatile
security definer
set search_path = public
as $$
  select
    public.feelings.id,
    public.feelings.text,
    public.feelings.mood,
    public.feelings.created_at,
    public.feelings.reported_count,
    public.feelings.comfort_count,
    public.comfort_phrase_counts(public.feelings.id) as comfort_phrase_counts
  from public.feelings
  where public.feelings.approved = true
    and public.feelings.hidden = false
  order by random()
  limit 1;
$$;

create or replace function public.submit_feeling(
  p_feeling_text text,
  p_feeling_mood text,
  p_client_token text
)
returns public.feelings
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_text text := trim(p_feeling_text);
  token_hash text := public.hash_client_token(p_client_token);
  new_row public.feelings;
begin
  if char_length(clean_text) < 2 or char_length(clean_text) > 700 then
    raise exception 'Please keep shared feelings between 2 and 700 characters.';
  end if;

  if p_feeling_mood not in ('heavy', 'angry', 'lonely', 'hopeful') then
    raise exception 'Please choose a valid mood.';
  end if;

  if p_client_token is null or char_length(p_client_token) < 12 then
    raise exception 'Could not verify this browser. Please refresh and try again.';
  end if;

  if exists (
    select 1
    from public.feelings
    where public.feelings.client_token_hash = token_hash
      and public.feelings.created_at > now() - interval '1 minute'
  ) then
    raise exception 'Please wait a minute before sharing another feeling.';
  end if;

  insert into public.feelings (text, mood, client_token_hash)
  values (clean_text, p_feeling_mood, token_hash)
  returning * into new_row;

  return new_row;
end;
$$;

drop function if exists public.report_feeling(uuid, text);
drop function if exists public.report_feeling(text, uuid);

create or replace function public.report_feeling(
  p_client_token text,
  p_feeling_id uuid
)
returns table(saved boolean, message text, reported_count integer, hidden boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  token_hash text := public.hash_client_token(p_client_token);
  saved_feeling_id uuid;
  current_reported_count integer := 0;
  current_hidden boolean := false;
begin
  if p_client_token is null or char_length(p_client_token) < 12 then
    raise exception 'Could not verify this browser. Please refresh and try again.';
  end if;

  if not exists (
    select 1
    from public.feelings
    where public.feelings.id = p_feeling_id
      and public.feelings.approved = true
      and public.feelings.hidden = false
  ) then
    return query select false, 'This feeling is no longer public.'::text, 0, true;
    return;
  end if;

  with inserted as (
    insert into public.feeling_actions (feeling_id, action_type, client_token_hash)
    values (p_feeling_id, 'report', token_hash)
    on conflict do nothing
    returning public.feeling_actions.feeling_id
  )
  select inserted.feeling_id
  into saved_feeling_id
  from inserted;

  if saved_feeling_id is null then
    select public.feelings.reported_count, public.feelings.hidden
    into current_reported_count, current_hidden
    from public.feelings
    where public.feelings.id = p_feeling_id;

    return query select false, 'You already reported this feeling.'::text, coalesce(current_reported_count, 0), coalesce(current_hidden, false);
    return;
  end if;

  update public.feelings
  set
    reported_count = public.feelings.reported_count + 1,
    hidden = case when public.feelings.reported_count + 1 >= 3 then true else public.feelings.hidden end
  where public.feelings.id = p_feeling_id
  returning public.feelings.reported_count, public.feelings.hidden
  into current_reported_count, current_hidden;

  return query select true, 'Thanks. This helps keep the room safe.'::text, current_reported_count, current_hidden;
end;
$$;

drop function if exists public.send_comfort(uuid, text, text);
drop function if exists public.send_comfort(text, text, uuid);

create or replace function public.send_comfort(
  p_client_token text,
  p_selected_comfort_phrase text,
  p_feeling_id uuid
)
returns table(saved boolean, message text, comfort_count integer, comfort_phrase_counts jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  token_hash text := public.hash_client_token(p_client_token);
  saved_feeling_id uuid;
  new_count integer := 0;
  new_phrase_counts jsonb := '{}'::jsonb;
begin
  if p_selected_comfort_phrase not in ('You''re not alone.', 'I hear you.', 'That sounds heavy.') then
    raise exception 'Please choose one of the available comfort messages.';
  end if;

  if p_client_token is null or char_length(p_client_token) < 12 then
    raise exception 'Could not verify this browser. Please refresh and try again.';
  end if;

  if not exists (
    select 1
    from public.feelings
    where public.feelings.id = p_feeling_id
      and public.feelings.approved = true
      and public.feelings.hidden = false
  ) then
    return query select false, 'This feeling is no longer public.'::text, 0, '{}'::jsonb;
    return;
  end if;

  with inserted as (
    insert into public.feeling_actions (feeling_id, action_type, comfort_phrase, client_token_hash)
    values (p_feeling_id, 'comfort', p_selected_comfort_phrase, token_hash)
    on conflict do nothing
    returning public.feeling_actions.feeling_id
  )
  select inserted.feeling_id
  into saved_feeling_id
  from inserted;

  if saved_feeling_id is null then
    select public.feelings.comfort_count
    into new_count
    from public.feelings
    where public.feelings.id = p_feeling_id;

    new_phrase_counts := public.comfort_phrase_counts(p_feeling_id);
    return query select false, 'You already sent comfort here.'::text, coalesce(new_count, 0), new_phrase_counts;
    return;
  end if;

  update public.feelings
  set comfort_count = public.feelings.comfort_count + 1
  where public.feelings.id = p_feeling_id
  returning public.feelings.comfort_count into new_count;

  new_phrase_counts := public.comfort_phrase_counts(p_feeling_id);
  return query select true, 'Comfort sent.'::text, coalesce(new_count, 0), new_phrase_counts;
end;
$$;

drop function if exists public.list_my_comforts(text);

create or replace function public.list_my_comforts(
  p_client_token text
)
returns table(feeling_id uuid, comfort_phrase text)
language plpgsql
security definer
set search_path = public
as $$
declare
  token_hash text := public.hash_client_token(p_client_token);
begin
  if p_client_token is null or char_length(p_client_token) < 12 then
    return;
  end if;

  return query
  select public.feeling_actions.feeling_id, public.feeling_actions.comfort_phrase
  from public.feeling_actions
  join public.feelings
    on public.feelings.id = public.feeling_actions.feeling_id
  where public.feeling_actions.client_token_hash = token_hash
    and public.feeling_actions.action_type = 'comfort'
    and public.feeling_actions.comfort_phrase is not null
    and public.feelings.approved = true
    and public.feelings.hidden = false;
end;
$$;

drop function if exists public.list_my_reports(text);

create or replace function public.list_my_reports(
  p_client_token text
)
returns table(feeling_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  token_hash text := public.hash_client_token(p_client_token);
begin
  if p_client_token is null or char_length(p_client_token) < 12 then
    return;
  end if;

  return query
  select public.feeling_actions.feeling_id
  from public.feeling_actions
  join public.feelings
    on public.feelings.id = public.feeling_actions.feeling_id
  where public.feeling_actions.client_token_hash = token_hash
    and public.feeling_actions.action_type = 'report'
    and public.feelings.approved = true
    and public.feelings.hidden = false;
end;
$$;

revoke all on public.feelings from anon, authenticated;
revoke all on public.feeling_actions from anon, authenticated;
grant select on public.feelings to anon;
grant execute on function public.get_public_stats() to anon;
grant execute on function public.list_public_feelings(integer, integer, text) to anon;
grant execute on function public.random_public_feeling() to anon;
grant execute on function public.submit_feeling(text, text, text) to anon;
grant execute on function public.report_feeling(text, uuid) to anon;
grant execute on function public.send_comfort(text, text, uuid) to anon;
grant execute on function public.list_my_comforts(text) to anon;
grant execute on function public.list_my_reports(text) to anon;
