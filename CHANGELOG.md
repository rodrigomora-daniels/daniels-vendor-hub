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
