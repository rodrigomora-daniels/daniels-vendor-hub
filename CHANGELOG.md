# My Workspace — Control de cambios

Repo: rodrigomora-daniels/daniels-vendor-hub (main, GitHub Pages) · Supabase: ecfxeebhtgkbsdeuiueb
App: https://rodrigomora-daniels.github.io/daniels-vendor-hub/index.html
Punto de restauración: commit `9838fca` (último cambio funcional del 16 nov; el tag no se pudo subir a GitHub desde este entorno).

## Línea de tiempo

| Fecha | Cambio | Commits |
|---|---|---|
| 11 nov | Evaluación v1: escalas cerradas 1-5, KPIs y pesos por rol, pares, feedback hacia arriba, jerarquía por roster, elegibilidad del periodo | db72087, e16253c, f3dd276 |
| 12 nov | Dashboard de evaluación en cockpit, Team Dashboard, KPIs de equipo, autoevaluación en el score, multi-jefe, Lead Source conectado a Supabase, PWA instalable | 5828734, c975bf4, 272e5cd, d05f5ba, f964697, b3ed5a5 |
| 13 nov | Seguridad Fase 1–3: sesiones con token (12 h, hash), 35 funciones con `p_token`, lecturas por RPC, carpeta `next/` | 71aba60 |
| 16 nov | Organigrama: Board, líneas directas/indirectas (punteadas), pisos, contador, zoom, Rebecca/Rey/Dennis, branding | 319a7ff … 1848560 |
| 16 nov | KPI por puesto con candados; herramientas de tienda solo para su gente; Certifications para todos | 27c1e6c |
| 16 nov | Registros de evaluación con acceso verificado por el servidor | 8dbbf11 |
| 16 nov | Renombrado "My Workspace"; códigos de invitación personales (40) con registro en un paso | 33b76c6 |
| 16 nov | Puntos de certificación como componente del score (6 meses, solo roles que las requieren) | 8358c76 |
| 16 nov | Fase 4 preparación: `next/` reconstruido con las páginas de hoy, sin llamadas directas a tablas | cd09175 |
| 16 nov | Popup de bienvenida bilingüe (primera visita, clave `dh_welcome_v1`) | d5088f4 … 9838fca |
| 16 nov | Fase 4 cutover: páginas raíz = versión con token; respaldo en `backup_pre_phase4/`; sw cache v2 | 3ebff90 |
| 16 nov | Fase 4 cierre en base de datos + SQL con rollback | 9426b5f |

## Decisiones de producto de hoy (16 nov)
- Herramientas de tienda (Pre-Screener, How They Found Us): solo sales / store_management / senior_management, admins, Ted, Karen. Certifications, Evaluation y Org chart: todos.
- KPI por puesto: metas con límites, peso mín/máx, hasta 3 KPIs extra (≤25% combinado), siempre prorrateado a 100%; se guarda la plantilla usada en cada evaluación.
- Acceso a registros: Rodrigo, dueños (Ted, Karen, Rebecca, Dani) y Rey Quiroz ven todo; el evaluador ve los suyos; los demás sus propios resultados.
- Certificaciones suman al score (esquema 70 + 10/10/10, propuesta de Claude), vigencia 6 meses.
- Feedback a managers: anónimo, solo si el manager tiene ≥3 en su equipo; el manager ve solo un resumen del grupo con ≥3 respuestas (`feedback_resumen_mi`); detalle anónimo solo para Rodrigo, dueños y Héctor; avisos de anonimato en pantalla.
- Dennis Jover: supervisor IT, directo a Ted, línea punteada a Rodrigo (peso 0), fuera del ciclo.
- Códigos personales: 40 (6 son de gente fuera de ciclo). Excel de códigos solo para managers/evaluadores.
- Correos (en espera): uno de anuncio a todos (sin Excel) y uno de guía a managers (con Excel), en inglés; contacto Hector Estrada; fecha límite 18 dic; cadencia trimestral + check-ins mensuales (propuesta); complementa el coaching log de Infinity.

## Base de datos (Supabase)
Creado hoy: `kpi_perfiles`, `kpi_plantilla`, `cert_requeridas`, `codigos_invitacion.roster_id`, columnas extra en `evaluacion_metricas`; funciones `kpi_plantilla_para`, `metricas_guardar` (validada), `eval_registros`, `eval_ve_todo`, `cert_score_all`, `codigo_signup_info`, `registrar_empleado`, `feedback_managers_elegibles` (regla ≥3), `feedback_ve_detalle`, `admin_ver_feedback_anonimo`, `feedback_puede_detalle`, `feedback_resumen_mi`, y las RPC de Fase 4 (`evaluacion_guardar`, `evaluacion_ciclo_activo`, `cert_intento_iniciar/guardar/abandonar`, `admin_organigrama_*`, `admin_ciclos_listar`, `admin_ciclo_crear`, `admin_ciclo_set_activo`, `admin_lead_source_listar`, `admin_audit_listar`). Constraint `evaluacion_config_componente_check2` ampliado con 'certificaciones'. SQL en `security/04`, `05`, `06`.

Cierre Fase 4 (verificado como rol anon): 0 filas en empleados y evaluaciones; `verificar_login` y funciones por id denegadas; login, registro, config pública y Lead Source siguen funcionando. Quedan abiertas solo: INSERT en `customer_source_log` y `prescreen_widget_log`, y las funciones públicas `evaluacion_config_get`, `evaluacion_no_elegibles_get`, `evaluacion_metricas_pct`, `organigrama_publico`, `codigo_reset_info`, `codigo_signup_info`, `registrar_empleado`, `iniciar_sesion`.

## Incidente post-cutover (16 nov, 17:28)
- Síntoma: el módulo de Evaluación decía "no hay ciclo activo" aunque el ciclo "Year-End 2026" sí está activo.
- Causa: 9 funciones nuevas de lectura estaban marcadas STABLE y la API rechaza POST sobre ellas (error 405): `evaluacion_ciclo_activo`, `feedback_puede_detalle`, `admin_ciclos_listar`, `admin_organigrama_listar`, `admin_lead_source_listar`, `admin_audit_listar`, y de forma preventiva `eval_registros`, `feedback_resumen_mi`, `kpi_plantilla_para`. Mi prueba con backend simulado no lo detectó.
- Arreglo: las 9 pasaron a VOLATILE (`alter function ... volatile`). Ninguna función con token queda STABLE. Regla: toda RPC nueva llamada por POST debe ser VOLATILE.
- Los registros de la API no muestran ningún otro error 4xx desde las 22:00 UTC.

## Limpieza previa al lanzamiento (16 nov, 17:40)
- A pedido de Rodrigo se borraron todas las evaluaciones de prueba: 4 evaluaciones (autoevaluaciones de Misael, Patricia Rivas y Brenda; evaluación de pares Rodrigo→Misael), 22 respuestas, 0 métricas y 2 feedbacks anónimos. Quedaron en cero; el ciclo "Year-End 2026" sigue activo (16 nov – 18 dic).
- Auditoría funcional previa al lanzamiento: ver incidente anterior; además se corrigió `codigo_signup_info` (pasó a VOLATILE, habría roto el registro con código) y `admin_organigrama_guardar` (convierte `nivel` a entero).
- Se agregó un código personal para Dennis Jover (total 41 códigos, ninguno usado) y el Excel se regeneró.

## Plantilla de ventas alineada al coaching log real (16 nov, 17:56)
- Fuente: "Progress Appraisal Report" de Jaime González (semana 1–7 nov, Brenda Vaccaro) y reporte semanal de ventas. Metas reales: ventas $70,000 por 4 semanas, servicios 10% (W2/W3 1.5%, Profit Boost 3.5%, Fabric Protection 5%), descuentos ≤1.8%, ticket promedio $1,350.
- Plantilla `vendedor` ahora: Monthly sales 40% (30–55) · Attachment rate 25% (15–35) · Average ticket 15% (10–25, meta $1,350, piso $1,200 = propuesta) · Lead source logged 10% (5–15) · Discounts 10% (5–15, meta ≤1.8%, dirección "menor es mejor"). Close rate se retiró porque no está en el coaching report. Suma 100.
- Pendiente: `sales_sup` conserva su plantilla anterior; el coaching log muestra revisión semanal/quincenal, no se ha reflejado en la cadencia.

## Cómo revertir
- **Páginas:** copiar `backup_pre_phase4/*` a la raíz (incluye `Daniels_Manager_Cert.html`, huérfana) y volver a `sw.js` cache `dhc-v1`; o `git revert 3ebff90`. Ojo: las páginas viejas dependen de las políticas/funciones antiguas, hay que revertir también la base.
- **Base de datos:** SQL de rollback de políticas en `security/06_phase4_lockdown.sql`; funciones: `grant execute on function ... to anon` por firma. Revertir páginas y base juntas o ninguna.
- **Punto completo:** commit `9838fca`.

## Limitaciones conocidas
- Los puntajes calculados en el navegador (evaluaciones, exámenes) el servidor los acepta tal cual.
- Cambiar contraseña no revoca otras sesiones; no hay limpieza de sesiones vencidas; throttle de login puede bloquear 10 min a un tercero.
- `daniels-prescreen-widget.html` inserta directo en `prescreen_widget_log` por diseño.
- La resolución de sobrecargas por nombre en PostgREST solo se probó con backend simulado y la prueba de Rodrigo; no hay prueba automatizada contra el sitio vivo (el entorno bloquea esa conexión).

## Pendientes
1. Actualizar los dos correos (resumen para managers, anonimato) y poner el link; enviar (esperando OK de Rodrigo).
2. Confirmar Héctor = Misael Estrada (admin_secundario).
3. Ted, Karen y Rey sin cuenta aún (acceso total se enlaza por nombre al registrarse; cockpit requiere es_admin).
4. Metas de ventas ($70k, 10% attachment) pendientes del coaching log de Infinity.
5. Rosario Rubi (part-time Cerritos) no está en el roster.
6. Certificados aún dicen "My Daniels Workspace".
7. Pesos nuevos y esquema de puntos de certificación: propuestas de Claude, sin ratificar.

## 2026-11-16 (tarde) — Appraisal traits integrated into the evaluation module
- Staff/warehouse behavior set is now 9 anchored 1–5 bilingual dimensions, ordered like the company's existing Performance Appraisal: Knowledge of work, Quantity, Quality, Ability to learn, Initiative, Cooperation, Judgment & common sense, Attendance/compliance, Service. New: conocimiento, volumen, aprendizaje, juicio (Supervisory Ability maps to existing `talento`).
- KPIs optional for profiles with no data source: `kpi_perfiles.kpi_opcional` = true for all except vendedor, sales_sup, store_mgr. `kpi_plantilla_para` returns `kpi_opcional`; UI shows "No KPI data yet: skip KPIs"; score_final falls back to conduct only; no metricas_guardar when skipped.
- Confidential "Recommendation & Comments" step (supervisor evaluations only): none/raise/promotion/transfer/termination, proposed $, strengths, areas to improve, comments (termination requires a written explanation). Columns on `evaluaciones`: reco_tipo, reco_aumento, fortalezas, debilidades, comentarios. `evaluacion_guardar` stores them only for tipo supervisor; `eval_registros` returns them only to the evaluator and eval_ve_todo users, never to the evaluee.
- Tested in rolled-back DB test: admin sees recommendation, evaluee does not.
- Rollback: restore previous Daniels_Evaluacion_Ventas.html from git (commit before this one); DB columns are additive and harmless.
- Pending: score-distribution view per evaluator (anti-leniency), Rey visibility decisions.

## 2026-11-16 (noche) — Bilingual pass + evaluator distribution
- Bilingual EN/ES (inline "EN / ES" style): index (login, signup, reset, password change, dashboard, badges, cert cards, history, all runtime errors/banners), Lead Source form (labels only; stored `data-source` values unchanged so reports keep working), Tier 1/2 exam intro screens. Exams and evaluation module were already bilingual.
- Left English-only by decision: Org Chart (user request), Admin Cockpit (admin tool), certificate text.
- New `admin_eval_distribucion` RPC (token + id overloads; id overload not executable by anon; returns [] for non-leadership) and cockpit section "Rating Distribution by Evaluator": n, average, min–max, spread, % ≥90, % raise/promotion, flag "Review leniency" (avg ≥ 88 or spread < 5 with 3+ evals).
- Verified: exam size is 28 per attempt (static "38" in HTML is overwritten at render).
