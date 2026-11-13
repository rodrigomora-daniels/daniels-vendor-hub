-- Phase 1: token-based READ RPCs that replace direct table reads in next/ pages.
-- All SECURITY DEFINER, all validate the token via sesion_validar. Old policies untouched.

-- Who am I (replaces empleados?id=eq.<id> reads and the ?emp= URL parameter)
create or replace function public.sesion_yo(p_token text)
returns table(id uuid, nombre_completo text, employee_id text, tienda text, rol text,
              es_admin boolean, nivel_admin text, departamento text, must_change_password boolean)
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v uuid;
begin
  v := public.sesion_validar(p_token);
  if v is null then raise exception 'Not authorized' using errcode = 'PT401'; end if;
  return query select e.id, e.nombre_completo, e.employee_id, e.tienda, e.rol, e.es_admin, e.nivel_admin, e.departamento, e.must_change_password
                 from empleados e where e.id = v;
end $$;

-- My own certification attempts + resets + extra attempts (replaces certificaciones_progreso /
-- certificacion_resets / certificacion_intentos_extra reads). Own rows only.
create or replace function public.certificacion_mis_intentos(p_token text, p_certificacion text default null)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v uuid;
begin
  v := public.sesion_validar(p_token);
  if v is null then return jsonb_build_object('success',false,'ok',false,'error','unauthorized','message','Not authorized.'); end if;
  return jsonb_build_object(
    'historial', coalesce((select jsonb_agg(to_jsonb(c) order by c.fecha_completado desc nulls last)
                  from certificaciones_progreso c
                  where c.empleado_id = v and (p_certificacion is null or c.certificacion = p_certificacion)), '[]'::jsonb),
    'resets',    coalesce((select jsonb_agg(jsonb_build_object('certificacion', r.certificacion, 'reset_at', r.reset_at) order by r.reset_at desc)
                  from certificacion_resets r
                  where r.empleado_id = v and (p_certificacion is null or r.certificacion = p_certificacion)), '[]'::jsonb),
    'extras',    coalesce((select jsonb_agg(jsonb_build_object('certificacion', x.certificacion, 'cantidad', x.cantidad, 'created_at', x.created_at))
                  from certificacion_intentos_extra x
                  where x.empleado_id = v and (p_certificacion is null or x.certificacion = p_certificacion)), '[]'::jsonb));
end $$;

-- Existing evaluation row I authored (self: evaluado = me). Replaces evaluaciones?... select=id,estado
create or replace function public.evaluacion_existente(p_token text, p_ciclo_id uuid, p_evaluado_id uuid, p_tipo text)
returns table(id uuid, estado text)
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v uuid;
begin
  v := public.sesion_validar(p_token);
  if v is null then raise exception 'Not authorized' using errcode = 'PT401'; end if;
  if p_tipo = 'self' then p_evaluado_id := v; end if;
  return query select e.id, e.estado from evaluaciones e
    where e.ciclo_id = p_ciclo_id and e.evaluado_id = p_evaluado_id and e.evaluador_id = v and e.tipo_evaluador = p_tipo;
end $$;

-- Previous completed supervisor evaluation of someone in MY line (or any if Super Admin).
create or replace function public.evaluacion_previa(p_token text, p_evaluado_id uuid, p_ciclo_id uuid)
returns table(score_final numeric, score_conductual numeric, pct_promedio_cuota numeric, feedback_narrativo text, completada_at timestamptz)
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v uuid; v_ok boolean;
begin
  v := public.sesion_validar(p_token);
  if v is null then raise exception 'Not authorized' using errcode = 'PT401'; end if;
  v_ok := exists (select 1 from empleados e where e.id = v and e.nivel_admin = 'super_admin')
       or exists (select 1 from public.evaluacion_mis_evaluados(p_evaluador_id => v) m where m.empleado_id = p_evaluado_id);
  if not v_ok then return; end if;
  return query select e.score_final, e.score_conductual, e.pct_promedio_cuota, e.feedback_narrativo, e.completada_at
    from evaluaciones e
   where e.evaluado_id = p_evaluado_id and e.tipo_evaluador = 'supervisor' and e.estado = 'completada'
     and e.ciclo_id is distinct from p_ciclo_id
   order by e.completada_at desc nulls last limit 1;
end $$;

-- Admin console reads (es_admin only). Replace empleados / certificaciones_progreso / certificacion_resets /
-- certificacion_intentos_extra / codigos_invitacion direct reads in cockpit.
create or replace function public.admin_empleados_listar(p_token text)
returns table(id uuid, nombre_completo text, username text, employee_id text, tienda text, rol text, es_admin boolean, nivel_admin text, departamento text)
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v uuid;
begin
  v := public.sesion_validar(p_token);
  if v is null or not exists (select 1 from empleados a where a.id = v and a.es_admin is true) then
    raise exception 'Not authorized' using errcode = 'PT401'; end if;
  return query select e.id, e.nombre_completo, e.username, e.employee_id, e.tienda, e.rol, e.es_admin, e.nivel_admin, e.departamento from empleados e;
end $$;

create or replace function public.admin_cert_overview(p_token text, p_detalle boolean default false)
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v uuid;
begin
  v := public.sesion_validar(p_token);
  if v is null or not exists (select 1 from empleados a where a.id = v and a.es_admin is true) then
    raise exception 'Not authorized' using errcode = 'PT401'; end if;
  return jsonb_build_object(
    'progreso', coalesce((select jsonb_agg(case when p_detalle then to_jsonb(c) - 'preguntas_seleccionadas' else to_jsonb(c) - 'preguntas_seleccionadas' - 'detalle_respuestas' end order by c.fecha_completado desc nulls last)
                 from certificaciones_progreso c), '[]'::jsonb),
    'resets',   coalesce((select jsonb_agg(jsonb_build_object('empleado_id',r.empleado_id,'certificacion',r.certificacion,'reset_at',r.reset_at) order by r.reset_at desc) from certificacion_resets r), '[]'::jsonb),
    'extras',   coalesce((select jsonb_agg(jsonb_build_object('empleado_id',x.empleado_id,'certificacion',x.certificacion,'cantidad',x.cantidad,'created_at',x.created_at) order by x.created_at desc) from certificacion_intentos_extra x), '[]'::jsonb));
end $$;

create or replace function public.admin_codigos_listar(p_token text)
returns table(codigo text, usado boolean, used_at timestamptz, usado_por_empleado_id uuid, created_at timestamptz)
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare v uuid;
begin
  v := public.sesion_validar(p_token);
  if v is null or not exists (select 1 from empleados a where a.id = v and a.es_admin is true) then
    raise exception 'Not authorized' using errcode = 'PT401'; end if;
  return query select c.codigo, c.usado, c.used_at, c.usado_por_empleado_id, c.created_at from codigos_invitacion c order by c.created_at desc;
end $$;

-- PUBLIC (pre-login) reset-code lookup: replaces codigos_invitacion + empleados reads in the reset-password screen.
-- The code itself is the bearer secret. Returns nothing unless the code is unused and is a reset code.
create or replace function public.codigo_reset_info(p_codigo text)
returns table(nombre_completo text, username text, employee_id text)
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
begin
  if p_codigo is null or length(p_codigo) < 4 then return; end if;
  return query select e.nombre_completo, e.username, e.employee_id
    from codigos_invitacion c join empleados e on e.id = c.empleado_id_reset
   where c.codigo = upper(p_codigo) and c.usado = false and c.empleado_id_reset is not null limit 1;
end $$;

do $g$ declare r record; begin
  for r in select p.oid::regprocedure as s from pg_proc p where p.pronamespace='public'::regnamespace
           and p.proname in ('sesion_yo','certificacion_mis_intentos','evaluacion_existente','evaluacion_previa','admin_empleados_listar','admin_cert_overview','admin_codigos_listar','codigo_reset_info')
  loop
    execute 'revoke all on function '||r.s||' from public';
    execute 'grant execute on function '||r.s||' to anon, authenticated';
  end loop;
end $g$;
