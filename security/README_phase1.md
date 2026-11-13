# Hub security — Phase 1 (additive)

Nothing old was touched: old RPC signatures, anon grants, policies and the root pages are unchanged.

## Added in the database (project ecfxeebhtgkbsdeuiueb)
- `sesiones` (token_hash = sha256 hex, empleado_id, expires_at 12h, revoked, last_used_at) and `login_fallos`. RLS on, no policies. No FK to empleados on purpose (admin_eliminar_empleado removes employees; orphan sessions are inert).
- `iniciar_sesion(p_username,p_password)`: same check as `verificar_login` (+ returns nivel_admin, departamento, token). 8 failures/10 min per existing username => generic "no rows".
- `sesion_validar(p_token) -> uuid`: internal, NOT executable by anon/authenticated.
- `cerrar_sesion(p_token)`: revokes a token (anon can call).
- 35 `p_token` overloads of the existing functions (admin_*, evaluacion_*, metricas_*, feedback, certificacion_estado, acknowledge_*, cambiar_password, registro_asignar_tienda). Each validates the token and calls the OLD function with the validated id, so authorization is exactly the old logic (incl. the hardened admin_iniciar_reset_password). Invalid token: success-shaped functions return `success=false,'Not authorized.'`; jsonb functions return `{error:'unauthorized'}`; data-returning functions raise SQLSTATE PT401 (HTTP 401). `acknowledge_*` declare `p_token` as `character varying` because (uuid,text,text) would collide with the old signature.
- Left as they are (public by design / internal): organigrama_publico, evaluacion_config_get, **evaluacion_no_elegibles_get (no id, still public — returns evaluado_id + motivo of people marked not eligible)**, verificar_login, registrar_empleado, admin_reset_password (not executable by anon already), evaluacion_resultado_v2 / progreso_core / progreso_det (not executable by anon).

## New read RPCs (replace direct table reads in /next/)
| RPC | Who | Returns / scope |
|---|---|---|
| `sesion_yo(p_token)` | any valid token | own employee row (id, nombre, employee_id, tienda, rol, es_admin, nivel_admin, departamento, must_change_password). Replaces `empleados?id=eq.` and `?emp=` |
| `certificacion_mis_intentos(p_token, p_certificacion?)` | any | jsonb {historial, resets, extras} — only the caller's rows of certificaciones_progreso / certificacion_resets / certificacion_intentos_extra |
| `evaluacion_existente(p_token, p_ciclo_id, p_evaluado_id, p_tipo)` | any | id+estado of an evaluation the caller authored (self: evaluado forced = caller) |
| `evaluacion_previa(p_token, p_evaluado_id, p_ciclo_id)` | Super Admin, or caller's `evaluacion_mis_evaluados` list | last completed supervisor evaluation scores/narrative of someone else's earlier cycle; empty if not in caller's line |
| `admin_empleados_listar(p_token)` | es_admin | employee list without password_hash |
| `admin_cert_overview(p_token, p_detalle)` | es_admin | jsonb {progreso, resets, extras} (progreso without preguntas_seleccionadas; detalle_respuestas only if p_detalle) |
| `admin_codigos_listar(p_token)` | es_admin | codigo, usado, used_at, usado_por_empleado_id, created_at |
| `codigo_reset_info(p_codigo)` | public (pre-login) | nombre, username, employee_id only for an unused reset code. The code is the secret; not throttled |

## Still direct (NOT yet behind a token — needs Phase 1.5 before Phase 4)
Writes: `certificaciones_progreso` INSERT/PATCH (both exam pages), `evaluaciones` + `evaluacion_respuestas` INSERT (evaluation page), `customer_source_log` INSERT (lead form), cockpit: `organigrama` CRUD, `evaluacion_ciclos` read/PATCH/INSERT, `customer_source_log` read, `admin_audit_log` read. Public RPCs `evaluacion_config_get`, `evaluacion_no_elegibles_get`, `organigrama_publico`.

## Phase 4 (Rodrigo + Hector)
1. Write RPCs with p_token for the items above, switch next/ to them.
2. Move next/ pages over the root pages (fix links), keep a rollback copy.
3. `revoke execute ... from anon` on the old id-based signatures and verificar_login.
4. Restrict `empleados` reads; make the four tables (evaluaciones, evaluacion_respuestas, certificaciones_progreso, codigos_invitacion) closed with `alter policy ... using (false)` (not dropping).
