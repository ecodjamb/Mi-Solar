-- Frontera privada del backend para proveedores. Las tablas permanecen sin
-- grants. La función no acepta SQL ni tablas arbitrarias y exige MISOLAR_DB_KEY.

create or replace function public.misolar_provider_backend(p_operation text, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_id bigint;
begin
  if not (select private.request_is_misolar()) then
    raise exception 'backend no autorizado' using errcode = '42501';
  end if;

  case p_operation
    when 'catalog' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',s.id,'name',s.name,'device_sn',s.device_sn,
        'providers',(select coalesce(jsonb_agg(jsonb_build_object('provider',a.provider,'enabled',a.enabled,'status',a.status,'last_success_at',a.last_success_at,'last_attempt_at',a.last_attempt_at) order by a.provider),'[]'::jsonb) from public.provider_accounts a where a.site_id=s.id)
      ) order by s.id),'[]'::jsonb) into v_result from public.solar_sites s;
    when 'accounts' then
      select jsonb_build_object(
        'sites',(select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]'::jsonb) from (select id,name,device_sn from public.solar_sites) s),
        'accounts',(select coalesce(jsonb_agg(to_jsonb(a) order by a.site_id,a.provider),'[]'::jsonb) from public.provider_accounts a),
        'devices',(select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) from (select id,provider_account_id,alias,model,serial_masked,logger_serial_masked,last_reading_at,active from public.provider_devices) d)
      ) into v_result;
    when 'site' then
      select to_jsonb(s) into v_result from (select id,name,device_sn from public.solar_sites where id=(p_payload->>'site_id')::bigint) s;
    when 'account' then
      select to_jsonb(a) into v_result from public.provider_accounts a where a.site_id=(p_payload->>'site_id')::bigint and a.provider=p_payload->>'provider';
    when 'save_account' then
      insert into public.provider_accounts(site_id,provider,enabled,username_masked,credentials_cipher,encryption_version,status,consecutive_failures,blocked_until,last_error_code,last_error_sanitized,updated_at)
      values ((p_payload->>'site_id')::bigint,p_payload->>'provider',true,p_payload->>'username_masked',p_payload->>'credentials_cipher',coalesce((p_payload->>'encryption_version')::smallint,1),'disconnected',0,null,null,null,now())
      on conflict(site_id,provider) do update set enabled=true,username_masked=excluded.username_masked,credentials_cipher=excluded.credentials_cipher,encryption_version=excluded.encryption_version,status='disconnected',consecutive_failures=0,blocked_until=null,last_error_code=null,last_error_sanitized=null,updated_at=now()
      returning to_jsonb(provider_accounts.*) into v_result;
    when 'disconnect' then
      update public.provider_sessions set revoked_at=now() where provider_account_id=(p_payload->>'account_id')::bigint and revoked_at is null;
      update public.provider_accounts set enabled=false,status='disconnected',credentials_cipher=null,username_masked=null,updated_at=now() where id=(p_payload->>'account_id')::bigint;
      v_result := jsonb_build_object('ok',true);
    when 'audit' then
      insert into public.credential_audit_events(site_id,provider_account_id,actor_user_id,action,success,metadata)
      values ((p_payload->>'site_id')::bigint,(p_payload->>'account_id')::bigint,nullif(p_payload->>'actor_user_id','')::uuid,p_payload->>'action',coalesce((p_payload->>'success')::boolean,false),coalesce(p_payload->'metadata','{}'::jsonb));
      v_result := jsonb_build_object('ok',true);
    when 'session_get' then
      select to_jsonb(x) into v_result from (select * from public.provider_sessions where provider_account_id=(p_payload->>'account_id')::bigint and revoked_at is null and expires_at>now()+interval '2 minutes' order by expires_at desc limit 1) x;
    when 'session_replace' then
      update public.provider_sessions set revoked_at=now() where provider_account_id=(p_payload->>'account_id')::bigint and revoked_at is null;
      insert into public.provider_sessions(provider_account_id,session_cipher,encryption_version,expires_at) values ((p_payload->>'account_id')::bigint,p_payload->>'session_cipher',(p_payload->>'encryption_version')::smallint,(p_payload->>'expires_at')::timestamptz);
      update public.provider_accounts set status='connected',consecutive_failures=0,blocked_until=null,last_success_at=now(),last_attempt_at=now(),last_error_code=null,last_error_sanitized=null,updated_at=now() where id=(p_payload->>'account_id')::bigint;
      v_result := jsonb_build_object('ok',true);
    when 'account_failure' then
      update public.provider_accounts set status=p_payload->>'status',consecutive_failures=(p_payload->>'failures')::smallint,blocked_until=nullif(p_payload->>'blocked_until','')::timestamptz,last_attempt_at=now(),last_error_code=left(p_payload->>'error_code',80),last_error_sanitized=left(p_payload->>'error_message',240),updated_at=now() where id=(p_payload->>'account_id')::bigint;
      v_result := jsonb_build_object('ok',true);
    when 'sync_start' then
      insert into public.sync_runs(site_id,provider,sync_type) values ((p_payload->>'site_id')::bigint,p_payload->>'provider',coalesce(p_payload->>'sync_type','manual')) returning id into v_id;
      v_result := jsonb_build_object('id',v_id);
    when 'sync_finish' then
      update public.sync_runs set status=p_payload->>'status',finished_at=now(),samples_received=coalesce((p_payload->>'samples_received')::integer,0),samples_inserted=coalesce((p_payload->>'samples_inserted')::integer,0),duplicates=coalesce((p_payload->>'duplicates')::integer,0),error_code=nullif(left(p_payload->>'error_code',80),''),error_sanitized=nullif(left(p_payload->>'error_message',240),''),duration_ms=(p_payload->>'duration_ms')::integer where id=(p_payload->>'run_id')::bigint;
      v_result := jsonb_build_object('ok',true);
    when 'device_upsert' then
      insert into public.provider_devices(provider_account_id,provider_device_id,device_identifier_cipher,serial_masked,logger_identifier_cipher,logger_serial_masked,alias,protocol_code,device_address,active,updated_at)
      values ((p_payload->>'account_id')::bigint,p_payload->>'provider_device_id',p_payload->>'device_identifier_cipher',p_payload->>'serial_masked',nullif(p_payload->>'logger_identifier_cipher',''),nullif(p_payload->>'logger_serial_masked',''),nullif(p_payload->>'alias',''),(p_payload->>'protocol_code')::integer,(p_payload->>'device_address')::integer,true,now())
      on conflict(provider_account_id,provider_device_id) do update set device_identifier_cipher=excluded.device_identifier_cipher,serial_masked=excluded.serial_masked,logger_identifier_cipher=excluded.logger_identifier_cipher,logger_serial_masked=excluded.logger_serial_masked,alias=excluded.alias,protocol_code=excluded.protocol_code,device_address=excluded.device_address,active=true,updated_at=now()
      returning to_jsonb(provider_devices.*) into v_result;
    when 'device_update' then
      update public.provider_devices set model=nullif(p_payload->>'model',''),firmware_main=nullif(p_payload->>'firmware_main',''),firmware_secondary=nullif(p_payload->>'firmware_secondary',''),last_reading_at=(p_payload->>'last_reading_at')::timestamptz,updated_at=now() where id=(p_payload->>'device_id')::bigint returning to_jsonb(provider_devices.*) into v_result;
    when 'raw_upsert' then
      insert into public.raw_provider_payloads(site_id,provider_device_id,provider,payload_type,provider_timestamp,sampled_at,sanitized_payload,payload_sha256,normalizer_version)
      values ((p_payload->>'site_id')::bigint,nullif(p_payload->>'provider_device_id','')::bigint,p_payload->>'provider',p_payload->>'payload_type',nullif(p_payload->>'provider_timestamp',''),nullif(p_payload->>'sampled_at','')::timestamptz,p_payload->'sanitized_payload',p_payload->>'payload_sha256',p_payload->>'normalizer_version')
      on conflict(provider,payload_sha256) do update set payload_sha256=excluded.payload_sha256 returning id into v_id;
      v_result := jsonb_build_object('id',v_id);
    when 'telemetry_upsert' then
      insert into public.telemetry_samples(site_id,inverter_id,provider_device_id,provider,sample_type,provider_timestamp,provider_timezone,sampled_at,sampled_at_local,data_age_seconds,canonical,quality,raw_payload_id,normalizer_version,idempotency_key)
      values ((p_payload->>'site_id')::bigint,nullif(p_payload->>'inverter_id','')::bigint,nullif(p_payload->>'provider_device_id','')::bigint,p_payload->>'provider',coalesce(p_payload->>'sample_type','realtime'),nullif(p_payload->>'provider_timestamp',''),nullif(p_payload->>'provider_timezone',''),(p_payload->>'sampled_at')::timestamptz,nullif(p_payload->>'sampled_at_local',''),(p_payload->>'data_age_seconds')::integer,p_payload->'canonical',coalesce(p_payload->'quality','{}'::jsonb),nullif(p_payload->>'raw_payload_id','')::bigint,p_payload->>'normalizer_version',p_payload->>'idempotency_key')
      on conflict(idempotency_key) do nothing returning id into v_id;
      v_result := jsonb_build_object('id',v_id,'inserted',v_id is not null);
    when 'latest' then
      select to_jsonb(x) into v_result from (select sampled_at,received_at,data_age_seconds,canonical,quality from public.telemetry_samples where site_id=(p_payload->>'site_id')::bigint and provider=p_payload->>'provider' order by sampled_at desc limit 1) x;
    when 'history' then
      select coalesce(jsonb_agg(to_jsonb(x) order by x.sampled_at),'[]'::jsonb) into v_result from (select sampled_at,received_at,canonical,quality from public.telemetry_samples where site_id=(p_payload->>'site_id')::bigint and provider=p_payload->>'provider' and sampled_at>=(p_payload->>'from')::timestamptz and sampled_at<(p_payload->>'to')::timestamptz order by sampled_at asc limit least(20000,greatest(1,coalesce((p_payload->>'limit')::integer,10000)))) x;
    else
      raise exception 'operación no permitida' using errcode = '22023';
  end case;
  return coalesce(v_result,'null'::jsonb);
end;
$$;

revoke all on function public.misolar_provider_backend(text,jsonb) from public, authenticated;
grant execute on function public.misolar_provider_backend(text,jsonb) to anon;
