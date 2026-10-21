begin;
create table if not exists public.nutrition_foods (
  id text primary key check (id ~ '^food_[0-9]{3}$'),
  name text not null,
  food_group text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and payload->>'id' = id)
);
create index if not exists nutrition_foods_group_idx on public.nutrition_foods(food_group, name);
alter table public.nutrition_foods enable row level security;
create policy "Authorized catalogue is readable" on public.nutrition_foods for select to anon, authenticated using (true);
grant select on public.nutrition_foods to anon, authenticated;
revoke insert, update, delete on public.nutrition_foods from anon, authenticated;

create table if not exists public.nutrition_daily_plans (
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  document jsonb not null check (jsonb_typeof(document) = 'object' and document->>'version' = '3'),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, plan_date)
);
alter table public.nutrition_daily_plans enable row level security;
create policy "Read own plans" on public.nutrition_daily_plans for select to authenticated using ((select auth.uid()) = user_id);
-- Writes go only through the version-checked function below.
grant select on public.nutrition_daily_plans to authenticated;
revoke insert, update, delete on public.nutrition_daily_plans from anon, authenticated;

create or replace function public.save_nutrition_daily_plan(p_date date, p_document jsonb, p_expected_revision integer, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner uuid := auth.uid();
  current_revision integer;
  new_revision integer;
  meal record;
  ingredient jsonb;
  goal text;
  fruit_count numeric := 0;
  fruit_reference_carbs numeric;
  food_data jsonb;
begin
  if owner is null or owner is distinct from p_user_id then raise exception 'Authentication required or session changed' using errcode='28000'; end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_document->>'version' is distinct from '3' or p_document->>'date' is distinct from p_date::text or jsonb_typeof(p_document->'meals') is distinct from 'object' then
    raise exception 'Invalid plan' using errcode='22023';
  end if;
  select (payload->>'carbohidratos_100g')::numeric * 1.25 into fruit_reference_carbs from public.nutrition_foods where id='food_002';
  if coalesce(fruit_reference_carbs,0) <= 0 then raise exception 'Missing authorized strawberry reference' using errcode='22023'; end if;
  foreach goal in array array['kcal','proteinas','carbohidratos','grasas'] loop
    if jsonb_typeof(p_document->'goals'->goal) is distinct from 'number' or coalesce((p_document->'goals'->>goal)::numeric,0) <= 0 or (p_document->'goals'->>goal)::numeric > 10000 then raise exception 'Invalid goals' using errcode='22023'; end if;
  end loop;
  if not coalesce((p_document->'meals' ?& array['Desayuno','Media mañana','Comida','Merienda','Cena']), false) then raise exception 'Missing meals' using errcode='22023'; end if;
  for meal in select * from jsonb_each(p_document->'meals') loop
    if meal.key not in ('Desayuno','Media mañana','Comida','Merienda','Cena') or jsonb_typeof(meal.value) <> 'array' then raise exception 'Invalid meal' using errcode='22023'; end if;
    for ingredient in select * from jsonb_array_elements(meal.value) loop
      select payload into food_data from public.nutrition_foods where id = ingredient->>'id';
      if food_data is null or jsonb_typeof(ingredient->'amount') is distinct from 'number' or jsonb_typeof(ingredient->'key') is distinct from 'string' or jsonb_typeof(ingredient->'role') is distinct from 'string' or coalesce((ingredient->>'amount')::numeric,-1) < 0 or (ingredient->>'amount')::numeric > 10000 then raise exception 'Unauthorized ingredient or quantity' using errcode='22023'; end if;
      if food_data->>'categoria' = 'fruta' and (ingredient->>'amount')::numeric > 0 then fruit_count := fruit_count + (ingredient->>'amount')::numeric * (food_data->>'carbohidratos_100g')::numeric / 100 / fruit_reference_carbs; end if;
      if meal.key <> 'Desayuno' and (ingredient->>'id' = 'food_137' or food_data->>'nombre' ilike '%leche%') then raise exception 'Coffee and milk are breakfast only' using errcode='22023'; end if;
      if meal.key = 'Cena' and food_data->>'categoria' = 'carbohidrato' then raise exception 'No carbohydrate garnish at dinner' using errcode='22023'; end if;
    end loop;
  end loop;
  if fruit_count > 2.000001 then raise exception 'Daily fruit limit exceeded' using errcode='22023'; end if;
  -- Serialize even the first insert for this user/date before reading its revision.
  perform pg_advisory_xact_lock(hashtextextended(owner::text || ':' || p_date::text, 0));
  select revision into current_revision from public.nutrition_daily_plans where user_id=owner and plan_date=p_date for update;
  if coalesce(current_revision,0) <> p_expected_revision then raise exception 'Plan changed on another device' using errcode='40001'; end if;
  new_revision := coalesce(current_revision,0)+1;
  insert into public.nutrition_daily_plans(user_id,plan_date,document,revision,updated_at)
  values(owner,p_date,p_document,new_revision,now())
  on conflict(user_id,plan_date) do update set document=excluded.document, revision=excluded.revision, updated_at=excluded.updated_at;
  return jsonb_build_object('revision',new_revision);
end;
$$;
revoke all on function public.save_nutrition_daily_plan(date,jsonb,integer,uuid) from public, anon;
grant execute on function public.save_nutrition_daily_plan(date,jsonb,integer,uuid) to authenticated;
-- Enable remote-change notifications when available; authentication is still enforced by RLS.
do $$ begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='nutrition_daily_plans') then
    alter publication supabase_realtime add table public.nutrition_daily_plans;
  end if;
end $$;
commit;
