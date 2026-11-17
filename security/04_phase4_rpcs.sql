-- Phase 4: token RPCs for every remaining direct table read/write. Additive. No drops.
create or replace function _tok(p_token text) returns uuid language plpgsql security definer set search_path to 'public','extensions','pg_temp' as $$
declare v uuid; begin v := public.sesion_validar(p_token);
  if v is null then raise exception 'Not authorized' using errcode='PT401'; end if; return v; end $$;
revoke execute on function _tok(text) from public, anon, authenticated;

create or replace function _es_super(p uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from empleados where id=p and nivel_admin='super_admin'); $$;
create or replace function _es_admin(p uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from empleados where id=p and es_admin=true); $$;
revoke execute on function _es_super(uuid), _es_admin(uuid) from public, anon, authenticated;

-- evaluation: active cycle, save, KPI template, records
create or replace function evaluacion_ciclo_activo(p_token text) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v uuid := _tok(p_token);
begin return (select to_jsonb(c) from (select id,nombre,tipo,fecha_inicio,fecha_cierre from evaluacion_ciclos where activo order by fecha_inicio desc limit 1) c); end $$;

create or replace function kpi_plantilla_para(p_token text, p_evaluado_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v uuid := _tok(p_token);
begin return kpi_plantilla_para(p_evaluador_id => v, p_evaluado_id => p_evaluado_id); end $$;

create or replace function eval_registros(p_token text, p_empleado_filtro uuid default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v uuid := _tok(p_token);
begin return eval_registros(p_empleado_id => v, p_empleado_filtro => p_empleado_filtro); end $$;

create or replace function evaluacion_guardar(p_token text, p_eval jsonb, p_respuestas jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare v uuid := _tok(p_token); tipo text := p_eval->>'tipo_evaluador'; evaluado uuid; ciclo uuid := (p_eval->>'ciclo_id')::uuid; new_id uuid;
begin
  if tipo not in ('self','supervisor','par') then raise exception 'Invalid type'; end if;
  evaluado := case when tipo='self' then v else (p_eval->>'evaluado_id')::uuid end;
  if not exists (select 1 from evaluacion_ciclos where id=ciclo and activo) then raise exception 'Cycle is not open'; end if;
  if tipo='par' and not exists (select 1 from evaluacion_mis_pares(v) x where x.empleado_id=evaluado) then raise exception 'Not allowed'; end if;
  if tipo='supervisor' and not (_es_super(v) or exists (select 1 from evaluacion_mis_evaluados(v) x where x.empleado_id=evaluado)) then raise exception 'Not allowed'; end if;
  insert into evaluaciones(ciclo_id,evaluado_id,evaluador_id,tipo_evaluador,track,estado,score_cuota,score_conductual,score_final,pct_promedio_cuota,completada_at)
  values (ciclo,evaluado,v,tipo,coalesce(p_eval->>'track','sales'),'completada',
    nullif(p_eval->>'score_cuota','')::numeric, nullif(p_eval->>'score_conductual','')::numeric, nullif(p_eval->>'score_final','')::numeric, nullif(p_eval->>'pct_promedio_cuota','')::numeric, now())
  returning id into new_id;
  insert into evaluacion_respuestas(evaluacion_id,dimension,pregunta_key,pregunta_texto,respuesta_score)
  select new_id, r->>'dimension', r->>'pregunta_key', r->>'pregunta_texto', (r->>'respuesta_score')::numeric
  from jsonb_array_elements(coalesce(p_respuestas,'[]')) r;
  return new_id;
end $$;

-- certifications
create or replace function cert_intento_iniciar(p_token text, p_certificacion text) returns uuid language plpgsql security definer set search_path=public as $$
declare v uuid := _tok(p_token); n int; new_id uuid; rest int;
begin
  if p_certificacion not in ('tier1','tier2') then raise exception 'Invalid certification'; end if;
  select restantes into rest from certificacion_estado(v) where certificacion=p_certificacion;
  if coalesce(rest,0) <= 0 then raise exception 'No attempts left'; end if;
  select count(*)+1 into n from certificaciones_progreso where empleado_id=v and certificacion=p_certificacion;
  insert into certificaciones_progreso(empleado_id,certificacion,started_at,estado,intento_numero) values (v,p_certificacion,now(),'in_progress',n) returning id into new_id;
  return new_id;
end $$;

create or replace function cert_intento_guardar(p_token text, p_id uuid, p_certificacion text, p_record jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare v uuid := _tok(p_token); rid uuid := p_id; n int;
begin
  if rid is null then
    if p_certificacion not in ('tier1','tier2') then raise exception 'Invalid certification'; end if;
    select count(*)+1 into n from certificaciones_progreso where empleado_id=v and certificacion=p_certificacion;
    insert into certificaciones_progreso(empleado_id,certificacion,started_at,intento_numero) values (v,p_certificacion,now(),n) returning id into rid;
  end if;
  update certificaciones_progreso set
    score=(p_record->>'score')::int, total_puntos=(p_record->>'total_puntos')::int, porcentaje=(p_record->>'porcentaje')::numeric,
    aprobado=(p_record->>'aprobado')::boolean, tiempo_usado_segundos=(p_record->>'tiempo_usado_segundos')::int,
    detalle_respuestas=p_record->'detalle_respuestas', preguntas_seleccionadas=p_record->'preguntas_seleccionadas',
    estado='completed', fecha_completado=now()
  where id=rid and empleado_id=v and estado in ('in_progress','abandoned');
  if not found then raise exception 'Attempt not found or already closed'; end if;
  return rid;
end $$;

create or replace function cert_intento_abandonar(p_token text, p_id uuid, p_segundos int) returns void language plpgsql security definer set search_path=public as $$
declare v uuid := _tok(p_token);
begin update certificaciones_progreso set estado='abandoned', tiempo_usado_segundos=p_segundos where id=p_id and empleado_id=v and estado='in_progress'; end $$;

-- cockpit
create or replace function admin_ciclos_listar(p_token text) returns setof evaluacion_ciclos language plpgsql stable security definer set search_path=public as $$
declare v uuid := _tok(p_token);
begin if not _es_admin(v) then raise exception 'Not authorized' using errcode='PT401'; end if;
  return query select * from evaluacion_ciclos order by fecha_inicio desc; end $$;

create or replace function admin_ciclo_crear(p_token text, p_nombre text, p_tipo text, p_inicio date, p_cierre date) returns uuid language plpgsql security definer set search_path=public as $$
declare v uuid := _tok(p_token); new_id uuid;
begin if not _es_super(v) then raise exception 'Only a Super Admin can change this.'; end if;
  update evaluacion_ciclos set activo=false where activo;
  insert into evaluacion_ciclos(nombre,tipo,fecha_inicio,fecha_cierre,activo) values (p_nombre,p_tipo,p_inicio,p_cierre,true) returning id into new_id;
  return new_id; end $$;

create or replace function admin_ciclo_set_activo(p_token text, p_id uuid, p_activo boolean) returns void language plpgsql security definer set search_path=public as $$
declare v uuid := _tok(p_token);
begin if not _es_super(v) then raise exception 'Only a Super Admin can change this.'; end if;
  if p_activo then update evaluacion_ciclos set activo=false where activo and id<>p_id; end if;
  update evaluacion_ciclos set activo=p_activo where id=p_id; end $$;

create or replace function admin_lead_source_listar(p_token text) returns setof customer_source_log language plpgsql stable security definer set search_path=public as $$
declare v uuid := _tok(p_token);
begin if not _es_admin(v) then raise exception 'Not authorized' using errcode='PT401'; end if;
  return query select * from customer_source_log order by submitted_at desc; end $$;

create or replace function admin_audit_listar(p_token text, p_limit int default 500) returns setof admin_audit_log language plpgsql stable security definer set search_path=public as $$
declare v uuid := _tok(p_token);
begin if not _es_super(v) then raise exception 'Not authorized' using errcode='PT401'; end if;
  return query select * from admin_audit_log order by created_at desc limit least(coalesce(p_limit,500),2000); end $$;

create or replace function admin_organigrama_listar(p_token text) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v uuid := _tok(p_token);
begin if not _es_admin(v) then raise exception 'Not authorized' using errcode='PT401'; end if;
  return coalesce((select jsonb_agg(to_jsonb(o)) from (select id,empleado_id,supervisor_id,track,nivel,titulo_display,peso from organigrama where activo) o),'[]'); end $$;

create or replace function admin_organigrama_guardar(p_token text, p_empleado_id uuid, p_supervisor_id uuid, p_track text, p_nivel text, p_peso numeric, p_titulo text) returns void language plpgsql security definer set search_path=public as $$
declare v uuid := _tok(p_token);
begin if not _es_super(v) then raise exception 'Only a Super Admin can change this.'; end if;
  update organigrama set activo=false where empleado_id=p_empleado_id and activo and supervisor_id is not distinct from p_supervisor_id;
  insert into organigrama(empleado_id,supervisor_id,track,nivel,peso,titulo_display,activo) values (p_empleado_id,p_supervisor_id,p_track,p_nivel,p_peso,nullif(p_titulo,''),true); end $$;

create or replace function admin_organigrama_quitar(p_token text, p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare v uuid := _tok(p_token);
begin if not _es_super(v) then raise exception 'Only a Super Admin can change this.'; end if;
  update organigrama set activo=false where id=p_id; end $$;

grant execute on function evaluacion_ciclo_activo(text), kpi_plantilla_para(text,uuid), eval_registros(text,uuid), evaluacion_guardar(text,jsonb,jsonb),
  cert_intento_iniciar(text,text), cert_intento_guardar(text,uuid,text,jsonb), cert_intento_abandonar(text,uuid,int),
  admin_ciclos_listar(text), admin_ciclo_crear(text,text,text,date,date), admin_ciclo_set_activo(text,uuid,boolean),
  admin_lead_source_listar(text), admin_audit_listar(text,int), admin_organigrama_listar(text),
  admin_organigrama_guardar(text,uuid,uuid,text,text,numeric,text), admin_organigrama_quitar(text,uuid) to anon, authenticated;

-- first-try badge must not rely on the old default of intento_numero
create or replace function cert_score_all(p_meses int default 6) returns table(eid uuid, score numeric)
language sql stable security definer set search_path=public as $$
  with req as (
    select r.empleado_id eid, cr.certificacion, count(*) over (partition by r.empleado_id) n
    from roster r join cert_requeridas cr on cr.perfil = r.kpi_perfil where r.empleado_id is not null
  ), val as (
    select q.eid, q.certificacion, q.n,
      exists (select 1 from certificaciones_progreso c where c.empleado_id=q.eid and c.certificacion=q.certificacion and c.aprobado
              and c.fecha_completado >= now() - make_interval(months => p_meses)) ok,
      exists (select 1 from certificaciones_progreso c where c.empleado_id=q.eid and c.certificacion=q.certificacion and c.aprobado and c.porcentaje>=100
              and c.fecha_completado >= now() - make_interval(months => p_meses)) perfect,
      exists (select 1 from certificaciones_progreso c where c.empleado_id=q.eid and c.certificacion=q.certificacion and c.aprobado
              and c.fecha_completado >= now() - make_interval(months => p_meses)
              and not exists (select 1 from certificaciones_progreso c0 where c0.empleado_id=c.empleado_id and c0.certificacion=c.certificacion and c0.id<>c.id and coalesce(c0.started_at,c0.fecha_completado) < coalesce(c.started_at,c.fecha_completado))) firsttry
    from req q
  )
  select eid, least(100, round(
      sum(case when ok then 70.0/n else 0 end)
    + case when bool_or(perfect) then 10 else 0 end
    + case when bool_or(firsttry) then 10 else 0 end
    + case when bool_and(ok) then 10 else 0 end, 1))
  from val group by eid;
$$;
