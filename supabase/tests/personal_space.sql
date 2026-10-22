-- Optional integration check in Supabase SQL Editor, after migrations and seed.
-- Uses an ephemeral key and day inside a transaction. ROLLBACK restores the real key and all data.
begin;
select set_config('mi_plato_test.access_key',public.configure_nutrition_personal_access(true),true);
set local role anon;
do $$
declare
  denied boolean;
  key text:=current_setting('mi_plato_test.access_key');
  day date:='2999-12-31';
  document jsonb;
  previous jsonb;
  base_revision integer;
  saved jsonb;
begin
  denied:=false;
  begin perform access_hash from public.nutrition_personal_settings; exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: anonymous access to hash'; end if;
  denied:=false;
  begin perform p.document from public.nutrition_personal_plans p; exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: direct anonymous access to plans'; end if;
  denied:=false;
  begin perform public.configure_nutrition_personal_access(true); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: anonymous key rotation'; end if;
  if public.check_nutrition_personal_access('invalid') then raise exception 'FAIL: invalid key accepted'; end if;
  denied:=false;
  begin perform public.read_nutrition_personal_plan('invalid',day); exception when sqlstate '28000' then denied:=true; end;
  if not denied then raise exception 'FAIL: read accepted without key'; end if;
  if not public.check_nutrition_personal_access(key) then raise exception 'FAIL: valid key rejected'; end if;
  previous:=public.read_nutrition_personal_plan(key,day);
  base_revision:=coalesce((previous->>'revision')::integer,0);
  document:=jsonb_build_object('version',3,'date',day::text,
    'goals',jsonb_build_object('kcal',1500,'proteinas',120,'carbohidratos',142.5,'grasas',50),
    'meals',jsonb_build_object('Desayuno','[]'::jsonb,'Media mañana','[]'::jsonb,'Comida','[]'::jsonb,'Merienda','[]'::jsonb,'Cena','[]'::jsonb));
  saved:=public.save_nutrition_personal_plan(key,day,document,base_revision);
  if (saved->>'revision')::integer<>base_revision+1 then raise exception 'FAIL: wrong revision'; end if;
  if public.read_nutrition_personal_plan(key,day)->'document' is distinct from document then raise exception 'FAIL: roundtrip changed the document'; end if;
  denied:=false;
  begin perform public.save_nutrition_personal_plan(key,day,document,base_revision); exception when sqlstate '40001' then denied:=true; end;
  if not denied then raise exception 'FAIL: stale revision accepted'; end if;
  raise notice 'PASS: private tables, protected key, read/write with key, and conflict handling';
end $$;
rollback;
