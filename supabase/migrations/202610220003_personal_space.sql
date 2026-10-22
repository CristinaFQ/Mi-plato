-- Single personal space: no signup, email, or Supabase Auth account is required.
-- Keep the access key out of frontend environment variables. It is entered once per device.
begin;
create extension if not exists pgcrypto with schema extensions;
create table if not exists public.nutrition_personal_settings (
  singleton boolean primary key default true check(singleton),
  access_hash text not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.nutrition_personal_plans (
  plan_date date primary key,
  document jsonb not null check(jsonb_typeof(document)='object' and document->>'version'='3'),
  revision integer not null default 1 check(revision>0),
  updated_at timestamptz not null default now()
);
alter table public.nutrition_personal_settings enable row level security;
alter table public.nutrition_personal_plans enable row level security;
revoke all on public.nutrition_personal_settings,public.nutrition_personal_plans from public,anon,authenticated;
-- No SELECT policies: possession of the public API key never exposes personal days or the hash.
create or replace function public.configure_nutrition_personal_access(p_rotate boolean default false)
returns text language plpgsql security definer set search_path='' as $$
declare access_key text;
begin
  if exists(select 1 from public.nutrition_personal_settings) and not p_rotate then
    raise exception 'Access already configured. Use p_rotate=true only to deliberately replace the key.' using errcode='22023';
  end if;
  access_key:=encode(extensions.gen_random_bytes(32),'hex');
  insert into public.nutrition_personal_settings(singleton,access_hash)
  values(true,encode(extensions.digest(access_key,'sha256'),'hex'))
  on conflict(singleton) do update set access_hash=excluded.access_hash,updated_at=now();
  return access_key;
end; $$;
revoke all on function public.configure_nutrition_personal_access(boolean) from public,anon,authenticated;
create or replace function public.check_nutrition_personal_access(p_access_key text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(length(p_access_key)=64 and p_access_key~'^[0-9a-f]{64}$' and exists(
    select 1 from public.nutrition_personal_settings
    where access_hash=encode(extensions.digest(p_access_key,'sha256'),'hex')
  ),false);
$$;
create or replace function public.read_nutrition_personal_plan(p_access_key text,p_date date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.check_nutrition_personal_access(p_access_key) then raise exception 'Invalid personal access' using errcode='28000'; end if;
  select jsonb_build_object('document',document,'revision',revision) into result from public.nutrition_personal_plans where plan_date=p_date;
  return result;
end; $$;
create or replace function public.save_nutrition_personal_plan(p_access_key text,p_date date,p_document jsonb,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  current_revision integer;
  new_revision integer;
  meal record;
  ingredient jsonb;
  goal text;
  fruit_count numeric:=0;
  fruit_reference_carbs numeric;
  food_data jsonb;
begin
  if not public.check_nutrition_personal_access(p_access_key) then raise exception 'Invalid personal access' using errcode='28000'; end if;
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
      if ingredient ? 'unitGrams' then
        if jsonb_typeof(ingredient->'unitGrams') is distinct from 'number' or (ingredient->>'unitGrams')::numeric <= 0 or (ingredient->>'unitGrams')::numeric > 1000 then raise exception 'Invalid edible unit weight' using errcode='22023'; end if;
      end if;
      if ingredient ? 'nutritionLabel' then
        if jsonb_typeof(ingredient->'nutritionLabel') is distinct from 'object' or jsonb_typeof(ingredient->'nutritionLabel'->'brand') is distinct from 'string' or length(trim(ingredient->'nutritionLabel'->>'brand')) = 0 then raise exception 'Invalid brand label' using errcode='22023'; end if;
        if food_data->>'categoria' not in ('carne','pescado_marisco','lacteos','carbohidrato','frutos_secos_semillas') then raise exception 'Label not supported for this food' using errcode='22023'; end if;
        foreach goal in array array['kcal','proteinas','carbohidratos','grasas'] loop
          if jsonb_typeof(ingredient->'nutritionLabel'->goal) is distinct from 'number' or (ingredient->'nutritionLabel'->>goal)::numeric < 0 or (ingredient->'nutritionLabel'->>goal)::numeric > 10000 then raise exception 'Invalid label nutrients' using errcode='22023'; end if;
        end loop;
      end if;
      if food_data->>'categoria' = 'fruta' and (ingredient->>'amount')::numeric > 0 then fruit_count := fruit_count + (ingredient->>'amount')::numeric * (food_data->>'carbohidratos_100g')::numeric / 100 / fruit_reference_carbs; end if;
      if meal.key <> 'Desayuno' and (ingredient->>'id' = 'food_137' or food_data->>'nombre' ilike '%leche%') then raise exception 'Coffee and milk are breakfast only' using errcode='22023'; end if;
      if meal.key = 'Cena' and food_data->>'categoria' = 'carbohidrato' then raise exception 'No carbohydrate garnish at dinner' using errcode='22023'; end if;
    end loop;
  end loop;
  if fruit_count > 2.000001 then raise exception 'Daily fruit limit exceeded' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('mi-plato-personal:'||p_date::text,0));
  select revision into current_revision from public.nutrition_personal_plans where plan_date=p_date for update;
  if coalesce(current_revision,0)<>p_expected_revision then raise exception 'Day changed on another device' using errcode='40001'; end if;
  new_revision:=coalesce(current_revision,0)+1;
  insert into public.nutrition_personal_plans(plan_date,document,revision,updated_at)
  values(p_date,p_document,new_revision,now())
  on conflict(plan_date) do update set document=excluded.document,revision=excluded.revision,updated_at=excluded.updated_at;
  return jsonb_build_object('revision',new_revision);
end; $$;
revoke all on function public.check_nutrition_personal_access(text) from public,anon,authenticated;
revoke all on function public.read_nutrition_personal_plan(text,date) from public,anon,authenticated;
revoke all on function public.save_nutrition_personal_plan(text,date,jsonb,integer) from public,anon,authenticated;
grant execute on function public.check_nutrition_personal_access(text) to anon,authenticated;
grant execute on function public.read_nutrition_personal_plan(text,date) to anon,authenticated;
grant execute on function public.save_nutrition_personal_plan(text,date,jsonb,integer) to anon,authenticated;
-- Preserve old cloud days automatically only when there was one owner. Multiple owners are never combined.
do $$ begin
  if (select count(distinct user_id) from public.nutrition_daily_plans)<=1 then
    insert into public.nutrition_personal_plans(plan_date,document,revision,updated_at)
    select plan_date,document,revision,updated_at from public.nutrition_daily_plans
    on conflict(plan_date) do nothing;
  end if;
end $$;
commit;
