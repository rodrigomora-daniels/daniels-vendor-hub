import re
# name -> (caller param, identity args, result)
T = {
'admin_cambiar_rol_empleado':('p_admin_id','p_admin_id uuid, p_empleado_id uuid, p_nuevo_rol text, p_nuevo_nivel_admin text','TABLE(success boolean, message text)'),
'admin_ciclo_set_fechas':('p_admin_id','p_admin_id uuid, p_inicio date, p_cierre date, p_nombre text DEFAULT NULL::text','jsonb'),
'admin_eliminar_empleado':('p_admin_id','p_admin_id uuid, p_empleado_id uuid','TABLE(success boolean, message text)'),
'admin_eliminar_intento_certificacion':('p_admin_id','p_admin_id uuid, p_intento_id uuid, p_detalle text DEFAULT NULL::text','TABLE(success boolean, message text)'),
'admin_generar_codigo':('p_admin_id',"p_admin_id uuid, p_rol_asignado text DEFAULT 'vendedor'::text, p_tienda_asignada text DEFAULT NULL::text, p_cantidad integer DEFAULT 1",'TABLE(codigo text)'),
'admin_iniciar_reset_password':('p_admin_id','p_admin_id uuid, p_empleado_id uuid','TABLE(success boolean, message text, codigo text)'),
'admin_otorgar_intentos_extra':('p_admin_id','p_admin_id uuid, p_empleado_id uuid, p_certificacion text, p_cantidad integer, p_notas text DEFAULT NULL::text','TABLE(success boolean, message text)'),
'admin_reclasificar_departamento':('p_admin_id','p_admin_id uuid, p_empleado_id uuid, p_departamento text','TABLE(success boolean, message text)'),
'admin_reclasificar_tienda':('p_admin_id','p_admin_id uuid, p_empleado_id uuid, p_tienda text','TABLE(success boolean, message text)'),
'admin_reset_certificacion':('p_admin_id','p_admin_id uuid, p_empleado_id uuid, p_certificacion text, p_notas text DEFAULT NULL::text','TABLE(success boolean, message text)'),
'admin_roster_listar':('p_admin_id','p_admin_id uuid','TABLE(roster_id uuid, nombre text, puesto text, ubicacion text, rol_eval text, registrado boolean, jefes text, n_reportes integer, en_ciclo boolean, se_evalua boolean, nota text)'),
'admin_roster_set_ciclo':('p_admin_id','p_admin_id uuid, p_roster_id uuid, p_en_ciclo boolean','TABLE(success boolean, message text)'),
'admin_sembrar_certificacion':('p_admin_id','p_admin_id uuid, p_empleado_id uuid, p_certificacion text, p_score integer, p_total_puntos integer, p_fecha timestamp with time zone','TABLE(success boolean, message text)'),
'admin_ver_feedback_anonimo':('p_admin_id','p_admin_id uuid, p_ciclo_id uuid DEFAULT NULL::uuid','TABLE(manager_id uuid, nombre text, tienda text, n integer, promedios jsonb)'),
'evaluacion_config_set':('p_admin_id','p_admin_id uuid, p_pesos jsonb, p_kpis jsonb','TABLE(success boolean, message text)'),
'evaluacion_progreso':('p_admin_id','p_admin_id uuid, p_ciclo_id uuid DEFAULT NULL::uuid','jsonb'),
'evaluacion_resultado':('p_admin_id','p_admin_id uuid, p_ciclo_id uuid DEFAULT NULL::uuid','TABLE(evaluado_id uuid, nombre text, rol_eval text, tienda text, kpi numeric, conducta numeric, liderazgo numeric, n_liderazgo integer, pares numeric, n_pares integer, final_score numeric, completo boolean)'),
'cambiar_password':('p_empleado_id','p_empleado_id uuid, p_password_actual text, p_password_nuevo text','TABLE(success boolean, message text)'),
'certificacion_estado':('p_empleado_id','p_empleado_id uuid','TABLE(certificacion text, intentos integer, extras integer, limite integer, aprobado boolean, restantes integer)'),
'enviar_feedback_anonimo':('p_empleado_id','p_empleado_id uuid, p_manager_id uuid, p_respuestas jsonb','TABLE(success boolean, message text)'),
'evaluacion_mi_contexto':('p_empleado_id','p_empleado_id uuid','TABLE(tiene_reportes boolean, n_jefes integer, n_pares integer, rol_eval text)'),
'evaluacion_mi_equipo':('p_empleado_id','p_empleado_id uuid','jsonb'),
'evaluacion_mi_progreso':('p_empleado_id','p_empleado_id uuid','jsonb'),
'evaluacion_mis_pares':('p_empleado_id','p_empleado_id uuid','TABLE(empleado_id uuid, nombre text, ubicacion text, ya_evaluado boolean)'),
'feedback_managers_elegibles':('p_empleado_id','p_empleado_id uuid','TABLE(manager_id uuid, nombre text, tienda text, ya_respondido boolean)'),
'registro_asignar_tienda':('p_empleado_id','p_empleado_id uuid, p_tienda text','TABLE(success boolean, message text)'),
'evaluacion_elegibilidad_set':('p_evaluador_id','p_evaluador_id uuid, p_evaluado_id uuid, p_elegible boolean, p_motivo text DEFAULT NULL::text','TABLE(success boolean, message text)'),
'evaluacion_mis_evaluados':('p_evaluador_id','p_evaluador_id uuid','TABLE(roster_id uuid, empleado_id uuid, nombre text, puesto text, ubicacion text, rol_eval text, registrado boolean, en_ciclo boolean, cubre text)'),
'metricas_guardar':('p_evaluador_id','p_evaluacion_id uuid, p_evaluador_id uuid, p_items jsonb','TABLE(success boolean, message text, pct_promedio numeric)'),
'metricas_plantilla_get':('p_evaluador_id','p_evaluador_id uuid','TABLE(nombre text, unidad text, orden integer)'),
'metricas_plantilla_set':('p_evaluador_id','p_evaluador_id uuid, p_items jsonb','TABLE(success boolean, message text)'),
'evaluacion_kpis_equipo_get':('p_manager_id','p_manager_id uuid','jsonb'),
'evaluacion_kpis_equipo_set':('p_manager_id','p_manager_id uuid, p_items jsonb','jsonb'),
'acknowledge_compromiso':('USERNAME',"p_compromiso_id uuid, p_empleado_username text, p_ip text DEFAULT NULL::text",'jsonb'),
'acknowledge_evaluation':('USERNAME',"p_evaluacion_id uuid, p_empleado_username text, p_ip text DEFAULT NULL::text",'jsonb'),
}
out=[]
for fn,(caller,args,res) in T.items():
    params=[a.strip() for a in re.split(r',\s*(?=p_)',args)]
    newp=[]; call=[]
    for a in params:
        nm=a.split()[0]
        if nm==caller or (caller=='USERNAME' and nm=='p_empleado_username'):
            newp.append('p_token character varying' if caller=='USERNAME' else 'p_token text'); call.append(None)
        else:
            newp.append(a); call.append(nm)
    # p_token must be first or in place; PostgREST uses names so order is irrelevant, but defaults must be trailing
    # move p_token to front if a defaulted param would precede it
    sig=', '.join(newp)
    if False:
        i=newp.index('p_token text')
        if any('DEFAULT' in x for x in newp[:i]):
            newp=['p_token text']+[x for x in newp if x!='p_token text']; sig=', '.join(newp)
    idarg = 'v' if caller!='USERNAME' else 'v_user'
    callname = caller if caller!='USERNAME' else 'p_empleado_username'
    cargs=[f'{callname} => {idarg}']+[f'{n} => {n}' for n in call if n]
    callstr=f"public.{fn}({', '.join(cargs)})"
    pre = ''
    if caller=='USERNAME':
        pre = "  select username into v_user from empleados where id = v;\n"
    decl = 'declare v uuid;' + (' v_user text;' if caller=='USERNAME' else '')
    if res=='jsonb':
        bad="return jsonb_build_object('success',false,'ok',false,'error','unauthorized','message','Not authorized.');"
        good=f"return {callstr};"
        rt='jsonb'
    elif res.startswith('TABLE(success boolean, message text'):
        cols=[c.strip() for c in res[6:-1].split(',')]
        sel=[]
        for c in cols:
            n,t=c.split(' ',1)
            sel.append("false" if n=='success' else "'Not authorized.'::text" if n=='message' else f"null::{t}")
        bad=f"return query select {', '.join(sel)}; return;"
        good=f"return query select * from {callstr};"
        rt=res
    else:
        bad="raise exception 'Not authorized' using errcode = 'PT401';"
        good=f"return query select * from {callstr};"
        rt=res
    out.append(f"""create or replace function public.{fn}({sig})
returns {rt}
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
{decl}
begin
  v := public.sesion_validar(p_token{'::text' if caller=='USERNAME' else ''});
  if v is null then {bad} end if;
{pre}  {good}
end $$;
""")
    # PT401 note: for jsonb good path 'return' w/o return query
names=", ".join("'"+k+"'" for k in T)
tail=f"""
do $g$ declare r record; begin
  for r in select p.oid::regprocedure as s from pg_proc p
           where p.pronamespace='public'::regnamespace and p.proname = any(array[{names}]) and 'p_token' = any(p.proargnames)
  loop
    execute 'revoke all on function '||r.s||' from public';
    execute 'grant execute on function '||r.s||' to anon, authenticated';
  end loop;
end $g$;
"""
open('02_wrappers.sql','w').write("-- Phase 1: p_token overloads. Generated by gen_wrappers.py. Old functions untouched.\n\n"+"\n".join(out)+tail)
print(len(out))
