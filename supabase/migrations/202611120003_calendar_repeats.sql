-- Additive validation; preserves existing accounts, tasks, and history.
create or replace function public.check_planner_repeats() returns trigger
language plpgsql set search_path = '' as $$
declare task jsonb; rule jsonb;
begin
 for task in select value from jsonb_array_elements(new.body->'tasks') loop
  rule := task->'repeat';
  if rule is not null and rule <> 'null'::jsonb then
   if jsonb_typeof(rule) is distinct from 'object'
    or coalesce(rule->>'unit','') not in ('day','week','month','year')
    or coalesce(rule->>'mode','') not in ('fixed','after')
    or jsonb_typeof(rule->'interval') is distinct from 'number'
    or jsonb_typeof(rule->'weekday') is distinct from 'number'
    or jsonb_typeof(rule->'paused') is distinct from 'boolean'
    or coalesce(task->>'deadline','') = '' then
     raise exception 'Invalid repeating task settings';
   end if;
   if (rule->>'interval')::numeric not between 1 and 365
    or trunc((rule->>'interval')::numeric) <> (rule->>'interval')::numeric
    or (rule->>'weekday')::numeric not between 0 and 6
    or trunc((rule->>'weekday')::numeric) <> (rule->>'weekday')::numeric then
     raise exception 'Invalid repeating task settings';
   end if;
  end if;
 end loop;
 return new;
end;
$$;
revoke all on function public.check_planner_repeats() from public, anon, authenticated;
