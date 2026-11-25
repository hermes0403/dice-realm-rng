-- T-0128 live behavior regression suite.
-- Run with a privileged SQL connection against the intended Supabase project.
-- All fixtures are created inside one explicit transaction and rolled back.
begin;
create temporary table guild_t128_test_results(
  test_name text primary key,
  passed boolean not null,
  detail text
) on commit drop;

do $$
declare
  u uuid[];
  g1 uuid;
  g2 uuid;
  g3 uuid;
  g4 uuid;
  g5 uuid;
  app_id uuid;
  app_id_2 uuid;
  result jsonb;
  ok boolean;
begin
  select array_agg(id order by created_at) into u
  from (
    select id, created_at from auth.users x
    where not exists(select 1 from public.guild_members m where m.user_id=x.id)
    order by created_at limit 20
  ) s;
  if coalesce(array_length(u,1),0) < 20 then
    raise exception 'TEST_SETUP: need 20 currently unassigned auth users';
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
  ok := false;
  begin
    perform public.guild_create('T128-no-auth-'||substr(gen_random_uuid()::text,1,8),'');
  exception when sqlstate '28000' then ok := sqlerrm='authentication_required';
  end;
  insert into guild_t128_test_results values('未登入不能建立公會',ok,'authentication_required');

  perform set_config('request.jwt.claim.sub',u[1]::text,true);
  result := public.guild_create('T128-'||substr(gen_random_uuid()::text,1,8),'');
  g1 := (result->>'guild_id')::uuid;
  insert into guild_t128_test_results values('建立者自動成為唯一會長',
    exists(select 1 from public.guild_members where guild_id=g1 and user_id=u[1] and role='leader'),
    'guild_create + leader membership');

  ok := false;
  begin
    perform public.guild_create('T128-duplicate-'||substr(gen_random_uuid()::text,1,8),'');
  exception when unique_violation then ok := sqlerrm='already_in_guild';
  end;
  insert into guild_t128_test_results values('同一玩家不能建立第二個公會',ok,'already_in_guild');

  perform set_config('request.jwt.claim.sub',u[2]::text,true);
  result := public.guild_apply(g1,'integration test');
  app_id := (result->>'application_id')::uuid;
  result := public.guild_apply(g1,'repeat integration test');
  app_id_2 := (result->>'application_id')::uuid;
  insert into guild_t128_test_results values('重複申請保持同一筆 pending application',
    app_id=app_id_2 and coalesce((result->>'already_applied')::boolean,false)
      and (select count(*)=1 from public.guild_applications where guild_id=g1 and applicant_id=u[2] and status='pending'),
    'same application id; one pending row');

  perform set_config('request.jwt.claim.sub',u[3]::text,true);
  ok := false;
  begin
    perform public.guild_review_application(app_id,true);
  exception when insufficient_privilege then ok := sqlerrm='guild_permission_denied';
  end;
  insert into guild_t128_test_results values('非公會成員不能審核申請',ok,
    case when ok then '42501 guild_permission_denied' else 'unauthorized review accepted' end);

  perform set_config('request.jwt.claim.sub',u[1]::text,true);
  result := public.guild_review_application(app_id,true);
  insert into guild_t128_test_results values('會長可核准申請',
    (result->>'status')='approved' and exists(
      select 1 from public.guild_members where guild_id=g1 and user_id=u[2] and role='member'),
    result::text);
  result := public.guild_review_application(app_id,true);
  insert into guild_t128_test_results values('重複核准不會重複加入',
    coalesce((result->>'already_processed')::boolean,false)
      and (select count(*)=1 from public.guild_members where guild_id=g1 and user_id=u[2]),
    result::text);

  ok := false;
  begin
    perform public.guild_leave();
  exception when check_violation then ok := sqlerrm='leader_must_transfer_or_disband';
  end;
  insert into guild_t128_test_results values('會長不可直接退出',ok,'leader transfer/disband required');

  perform set_config('request.jwt.claim.sub',u[4]::text,true);
  result := public.guild_create('T128-vice-'||substr(gen_random_uuid()::text,1,8),'');
  g2 := (result->>'guild_id')::uuid;
  insert into public.guild_members(guild_id,user_id,role)
  values(g2,u[5],'vice_leader'),(g2,u[6],'vice_leader');
  ok := false;
  begin
    insert into public.guild_members(guild_id,user_id,role) values(g2,u[7],'vice_leader');
  exception when check_violation then ok := sqlerrm='guild_role_limit_reached';
  end;
  insert into guild_t128_test_results values('副會長上限為 2 人',ok,'third vice_leader rejected');

  perform set_config('request.jwt.claim.sub',u[8]::text,true);
  result := public.guild_create('T128-officer-'||substr(gen_random_uuid()::text,1,8),'');
  g3 := (result->>'guild_id')::uuid;
  insert into public.guild_members(guild_id,user_id,role)
  values(g3,u[9],'officer'),(g3,u[10],'officer'),(g3,u[11],'officer');
  ok := false;
  begin
    insert into public.guild_members(guild_id,user_id,role) values(g3,u[12],'officer');
  exception when check_violation then ok := sqlerrm='guild_role_limit_reached';
  end;
  insert into guild_t128_test_results values('幹部上限為 3 人',ok,'fourth officer rejected');

  perform set_config('request.jwt.claim.sub',u[13]::text,true);
  result := public.guild_create('T128-cap-'||substr(gen_random_uuid()::text,1,8),'');
  g4 := (result->>'guild_id')::uuid;
  insert into public.guild_members(guild_id,user_id,role)
  values(g4,u[14],'member'),(g4,u[15],'member'),(g4,u[16],'member');
  ok := false;
  begin
    insert into public.guild_members(guild_id,user_id,role) values(g4,u[17],'member');
  exception when check_violation then ok := sqlerrm='guild_member_limit_reached';
  end;
  insert into guild_t128_test_results values('公會成員總數上限為 4 人',ok,'fifth member rejected');

  ok := false;
  begin
    insert into public.guild_members(guild_id,user_id,role) values(g2,u[2],'member');
  exception when unique_violation then ok := true;
  end;
  insert into guild_t128_test_results values('玩家不能同時加入兩個公會',ok,'unique user_id constraint');

  perform set_config('request.jwt.claim.sub',u[20]::text,true);
  result := public.guild_search('T128-',30);
  insert into guild_t128_test_results values('搜尋只回傳公開公會欄位',
    jsonb_typeof(result)='array'
      and exists(select 1 from jsonb_array_elements(result) x where x->>'id'=g1::text)
      and not exists(select 1 from jsonb_array_elements(result) x where x ? 'created_by' or x ? 'user_id' or x ? 'email'),
    'public search payload only');

  result := public.guild_apply(g1,'rejection test');
  app_id_2 := (result->>'application_id')::uuid;
  perform set_config('request.jwt.claim.sub',u[1]::text,true);
  result := public.guild_review_application(app_id_2,false);
  insert into guild_t128_test_results values('幹部可拒絕申請且申請者不會加入',
    (result->>'status')='rejected'
      and exists(select 1 from public.guild_applications where id=app_id_2 and status='rejected')
      and not exists(select 1 from public.guild_members where guild_id=g1 and user_id=u[20]),
    result::text);

  perform set_config('request.jwt.claim.sub',u[18]::text,true);
  result := public.guild_create('T128-open-'||substr(gen_random_uuid()::text,1,8),'');
  g5 := (result->>'guild_id')::uuid;
  update public.guilds set join_mode='open' where id=g5;
  perform set_config('request.jwt.claim.sub',u[19]::text,true);
  result := public.guild_apply(g5,'');
  insert into guild_t128_test_results values('公開公會直接加入成功',
    coalesce((result->>'joined')::boolean,false)
      and exists(select 1 from public.guild_members where guild_id=g5 and user_id=u[19] and role='member'),
    result::text);
end $$;

select * from guild_t128_test_results order by test_name;
do $$
begin
  if exists(select 1 from guild_t128_test_results where not passed) then
    raise exception 'T-0128 behavior test failure';
  end if;
end $$;
rollback;
