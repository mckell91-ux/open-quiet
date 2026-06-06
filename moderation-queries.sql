-- Leave It Here moderation queries.
-- Run these only inside Supabase SQL Editor while logged in as the project owner/admin.
-- Do not put service role keys or admin update permissions in the public website.

-- View all feelings, including hidden, reported, and unapproved.
select
  id,
  text,
  mood,
  created_at,
  reported_count,
  comfort_count,
  hidden,
  approved
from public.feelings
order by created_at desc;

-- View newest first.
select
  id,
  text,
  mood,
  created_at,
  reported_count,
  comfort_count,
  hidden,
  approved
from public.feelings
order by created_at desc;

-- View most reported first.
select
  id,
  text,
  mood,
  created_at,
  reported_count,
  comfort_count,
  hidden,
  approved
from public.feelings
order by reported_count desc, created_at desc;

-- Hide a post.
-- Replace PASTE_FEELING_ID_HERE with the post id.
update public.feelings
set hidden = true
where id = 'PASTE_FEELING_ID_HERE';

-- Unhide a post.
-- Replace PASTE_FEELING_ID_HERE with the post id.
update public.feelings
set hidden = false
where id = 'PASTE_FEELING_ID_HERE';

-- Approve a post if you later decide to set approved=false by default.
update public.feelings
set approved = true
where id = 'PASTE_FEELING_ID_HERE';

-- Unapprove a post without deleting it.
update public.feelings
set approved = false
where id = 'PASTE_FEELING_ID_HERE';

-- Delete only if absolutely needed.
-- This permanently removes the post and related report/comfort actions.
delete from public.feelings
where id = 'PASTE_FEELING_ID_HERE';
