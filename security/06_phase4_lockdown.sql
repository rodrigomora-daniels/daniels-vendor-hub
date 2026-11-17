-- Phase 4 lockdown applied 2026-11-16.
-- 1) EXECUTE revoked (public, anon, authenticated) on every public function whose args lack p_token,
--    except: evaluacion_config_get, evaluacion_no_elegibles_get, evaluacion_metricas_pct, organigrama_publico,
--    codigo_reset_info, codigo_signup_info, registrar_empleado, iniciar_sesion.
-- 2) Anon policies closed (using/with check false), except INSERT on customer_source_log and prescreen_widget_log.
-- ROLLBACK for policies (SELECT/UPDATE/ALL):
alter policy allow_anon_read_empleados on public.empleados using (true);
alter policy "permitir leer todos los empleados (para admin)" on public.empleados using (true);
alter policy "permitir actualizar certificaciones_progreso (anon)" on public.certificaciones_progreso using (true) with check (true);
alter policy "permitir leer resultados de certificacion" on public.certificaciones_progreso using (true);
alter policy "permitir leer customer source log (para admin)" on public.customer_source_log using (true);
alter policy "permitir leer codigos_invitacion (anon)" on public.codigos_invitacion using (true);
alter policy "permitir leer audit log" on public.admin_audit_log using (true);
alter policy "permitir leer certificacion_resets (anon)" on public.certificacion_resets using (true);
alter policy allow_anon_organigrama on public.organigrama using (true) with check (true);
alter policy allow_anon_read_ciclos on public.evaluacion_ciclos using (true);
alter policy anon_eval_select on public.evaluaciones using (true);
alter policy anon_resp_select on public.evaluacion_respuestas using (true);
-- INSERT policies set to with check (false): anon_eval_insert, anon_resp_insert, "permitir guardar resultado de examen", "permitir insertar audit log" (restore with check (true)).
-- Old pages: backup_pre_phase4/ (restore by copying back). Old function grants: grant execute ... to anon.

-- 2026-11-16: these functions were switched to VOLATILE after a 405 from the API (STABLE not callable via POST): evaluacion_ciclo_activo, feedback_puede_detalle, feedback_resumen_mi, eval_registros, kpi_plantilla_para, admin_ciclos_listar, admin_organigrama_listar, admin_lead_source_listar, admin_audit_listar. Always create new token RPCs as VOLATILE.
