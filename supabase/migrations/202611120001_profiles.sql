begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  birthdate date check (birthdate is null or (birthdate >= date '1900-01-01' and birthdate <= current_date)),
  created_at timestamptz not null default now()
);
create table public.planners (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  body jsonb not null,
  updated_at timestamptz not null default now()
);
create table public.planner_history (
  owner_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null,
  body jsonb not null,
  saved_at timestamptz not null default now(),
  primary key(owner_id, revision)
);

alter table public.profiles enable row level security;
alter table public.planners enable row level security;
alter table public.planner_history enable row level security;
create policy profile_read on public.profiles for select to authenticated using ((select auth.uid())=id);
create policy profile_create on public.profiles for insert to authenticated with check ((select auth.uid())=id);
create policy profile_edit on public.profiles for update to authenticated using ((select auth.uid())=id) with check ((select auth.uid())=id);
create policy planner_read on public.planners for select to authenticated using ((select auth.uid())=owner_id);
create policy history_read on public.planner_history for select to authenticated using ((select auth.uid())=owner_id);
revoke all on public.profiles, public.planners, public.planner_history from public, anon, authenticated;
grant select,insert on public.profiles to authenticated;
grant update(name,username,birthdate) on public.profiles to authenticated;
grant select on public.planners,public.planner_history to authenticated;

create function public.validate_planner(doc jsonb) returns void
language plpgsql set search_path='' as $$
declare item jsonb; parent jsonb; seen text[]; p text; schedule jsonb;
begin
 if doc is null or jsonb_typeof(doc) is distinct from 'object' or octet_length(doc::text)>1000000 then raise exception 'Invalid planner size'; end if;
 if jsonb_typeof(doc->'tabs') is distinct from 'array' or jsonb_typeof(doc->'categories') is distinct from 'array' or jsonb_typeof(doc->'tasks') is distinct from 'array' then raise exception 'Invalid planner collections'; end if;
 for p in select unnest(array['tabs','categories','tasks']) loop
  if jsonb_array_length(doc->p)>10000 or exists(select 1 from jsonb_array_elements(doc->p) x where jsonb_typeof(x->'id') is distinct from 'string' or length(x->>'id') not between 1 and 100) or (select count(*) from jsonb_array_elements(doc->p))<>(select count(distinct x->>'id') from jsonb_array_elements(doc->p) x) then raise exception 'Invalid record IDs'; end if;
 end loop;
 for item in select value from jsonb_array_elements(doc->'tabs') loop
  if jsonb_typeof(item->'name') is distinct from 'string' or length(trim(item->>'name')) not between 1 and 60 or coalesce(item->>'color','') !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Invalid tab'; end if;
  if item ? 'timed' and jsonb_typeof(item->'timed') is distinct from 'boolean' then raise exception 'Invalid tab mode'; end if;
  if item->>'timed'='true' and not item ? 'schedule' then raise exception 'Missing schedule'; end if;
 end loop;
 for item in select value from jsonb_array_elements(doc->'categories') loop
  if jsonb_typeof(item->'name') is distinct from 'string' or length(trim(item->>'name')) not between 1 and 80 or not exists(select 1 from jsonb_array_elements(doc->'tabs') t where t->>'id'=item->>'tabId') then raise exception 'Invalid category'; end if;
 end loop;
 for item in select value from jsonb_array_elements(doc->'tasks') loop
  if jsonb_typeof(item->'title') is distinct from 'string' or length(trim(item->>'title')) not between 1 and 2000 or jsonb_typeof(item->'notes') is distinct from 'string' or length(item->>'notes')>10000 or jsonb_typeof(item->'done') is distinct from 'boolean' or coalesce(item->>'progress','') not in ('Not started','In progress','Waiting','On hold') then raise exception 'Invalid task'; end if;
  if not exists(select 1 from jsonb_array_elements(doc->'categories') c where c->>'id'=item->>'categoryId' and c->>'tabId'=item->>'tabId') then raise exception 'Invalid task category'; end if;
  if not item ? 'hours' or (jsonb_typeof(item->'hours')<>'null' and (jsonb_typeof(item->'hours')<>'number' or (item->>'hours')::numeric not between 0 and 100000)) then raise exception 'Invalid duration'; end if;
  if jsonb_typeof(item->'deadline') is distinct from 'string' then raise exception 'Invalid deadline'; end if;
  if item->>'deadline'<>'' and (to_char((item->>'deadline')::date,'YYYY-MM-DD')<>item->>'deadline') then raise exception 'Invalid deadline'; end if;
  seen=array[item->>'id'];p=item->>'parentId';
  while p is not null loop
   if p=any(seen) or cardinality(seen)>50 then raise exception 'Circular subtask'; end if;
   select value into parent from jsonb_array_elements(doc->'tasks') where value->>'id'=p;
   if parent is null or parent->>'tabId'<>item->>'tabId' or parent->>'categoryId'<>item->>'categoryId' then raise exception 'Invalid parent'; end if;
   seen=array_append(seen,p);p=parent->>'parentId';
  end loop;
 end loop;
 for schedule in select value->'schedule' from jsonb_array_elements(doc->'tabs') where value ? 'schedule' loop
  if jsonb_typeof(schedule) is distinct from 'object' or coalesce(schedule->>'start','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or jsonb_typeof(schedule->'date') is distinct from 'string' or to_char((schedule->>'date')::date,'YYYY-MM-DD')<>schedule->>'date' or jsonb_typeof(schedule->'taskIds') is distinct from 'array' then raise exception 'Invalid schedule'; end if;
  if exists(select 1 from jsonb_array_elements_text(schedule->'taskIds') id where not exists(select 1 from jsonb_array_elements(doc->'tasks') t where t->>'id'=id)) or (select count(*) from jsonb_array_elements_text(schedule->'taskIds'))<>(select count(distinct value) from jsonb_array_elements_text(schedule->'taskIds')) then raise exception 'Invalid schedule task'; end if;
 end loop;
end $$;

create function public.load_planner() returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid=auth.uid(); result jsonb;
begin
 if who is null then raise exception 'Sign in required'; end if;
 if not exists(select 1 from public.profiles where id=who) then raise exception 'Complete your profile first'; end if;
 insert into public.planners(owner_id,body) values(who,'{"tabs":[{"id":"personal","name":"Personal","color":"#db754b"}],"categories":[{"id":"general","tabId":"personal","name":"General"}],"tasks":[],"dayPlans":[]}'::jsonb) on conflict(owner_id) do nothing;
 select jsonb_build_object('revision',revision,'data',body) into result from public.planners where owner_id=who;
 return result;
end $$;

create function public.save_planner(expected_revision bigint, new_body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare who uuid=auth.uid(); old public.planners%rowtype;
begin
 if who is null then raise exception 'Sign in required'; end if;
 perform public.validate_planner(new_body);
 select * into old from public.planners where owner_id=who for update;
 if not found then raise exception 'Load your planner first'; end if;
 if expected_revision is null or old.revision<>expected_revision then raise exception 'REVISION_CONFLICT'; end if;
 insert into public.planner_history(owner_id,revision,body) values(who,old.revision,old.body);
 update public.planners set body=new_body,revision=old.revision+1,updated_at=now() where owner_id=who;
 delete from public.planner_history where owner_id=who and revision not in (select revision from public.planner_history where owner_id=who order by revision desc limit 10);
 return jsonb_build_object('revision',old.revision+1);
end $$;

create function public.delete_my_account() returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 delete from auth.users where id=auth.uid();
end $$;

revoke all on function public.validate_planner(jsonb),public.load_planner(),public.save_planner(bigint,jsonb),public.delete_my_account() from public,anon,authenticated;
grant execute on function public.load_planner(),public.save_planner(bigint,jsonb),public.delete_my_account() to authenticated;
commit;
