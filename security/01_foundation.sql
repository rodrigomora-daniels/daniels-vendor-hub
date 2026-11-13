-- Phase 1 (additive): server-issued sessions. Nothing here touches old functions/policies.

create table if not exists public.sesiones (
  token_hash   text primary key,
  empleado_id  uuid not null,   -- no FK on purpose: admin_eliminar_empleado removes employees; orphan sessions are inert (sesion_validar joins empleados)
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  revoked      boolean not null default false,
  last_used_at timestamptz
);
create index if not exists sesiones_empleado_idx on public.sesiones(empleado_id);
alter table public.sesiones enable row level security;   -- no policies: only definer functions touch it

create table if not exists public.login_fallos (
  id bigserial primary key,
  username text not null,
  created_at timestamptz not null default now()
);
create index if not exists login_fallos_user_time_idx on public.login_fallos(username, created_at);
alter table public.login_fallos enable row level security;  -- no policies

-- internal: token -> empleado_id (or null)
create or replace function public.sesion_validar(p_token text)
returns uuid language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_h text; v_emp uuid;
begin
  if p_token is null or length(p_token) < 32 then return null; end if;
  v_h := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select s.empleado_id into v_emp
    from sesiones s join empleados e on e.id = s.empleado_id
   where s.token_hash = v_h and not s.revoked and s.expires_at > now()
     and coalesce(e.is_locked, false) = false;
  if v_emp is null then return null; end if;
  update sesiones set last_used_at = now()
   where token_hash = v_h and (last_used_at is null or last_used_at < now() - interval '1 minute');
  return v_emp;
end $$;
revoke all on function public.sesion_validar(text) from public, anon, authenticated;

create or replace function public.cerrar_sesion(p_token text)
returns boolean language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare v_h text; n int;
begin
  if p_token is null then return false; end if;
  v_h := encode(extensions.digest(p_token, 'sha256'), 'hex');
  update sesiones set revoked = true where token_hash = v_h and not revoked;
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke all on function public.cerrar_sesion(text) from public;
grant execute on function public.cerrar_sesion(text) to anon, authenticated;

-- login: same logic/return fields as verificar_login (+ nivel_admin, departamento, token)
create or replace function public.iniciar_sesion(p_username text, p_password text)
returns table(id uuid, nombre_completo text, employee_id text, tienda text, rol text,
              must_change_password boolean, es_admin boolean, nivel_admin text, departamento text, token text)
language plpgsql security definer
set search_path = public, extensions, pg_temp as $$
declare r record; v_tok text; v_fails int;
begin
  -- throttle: 8 failures per username in 10 minutes -> generic "invalid login" (no rows)
  select count(*) into v_fails from login_fallos f
   where f.username = p_username and f.created_at > now() - interval '10 minutes';
  if v_fails >= 8 then return; end if;

  select e.* into r from empleados e
   where e.username = p_username
     and e.password_hash = crypt(p_password, e.password_hash)
     and coalesce(e.is_locked, false) = false;

  if not found then
    -- record only for existing usernames (keeps the table from being spammed with junk names)
    if exists (select 1 from empleados e where e.username = p_username) then
      insert into login_fallos(username) values (p_username);
    end if;
    return;
  end if;

  v_tok := encode(extensions.gen_random_bytes(32), 'hex');
  insert into sesiones(token_hash, empleado_id, expires_at)
  values (encode(extensions.digest(v_tok, 'sha256'), 'hex'), r.id, now() + interval '12 hours');

  return query select r.id, r.nombre_completo, r.employee_id, r.tienda, r.rol,
                      r.must_change_password, r.es_admin, r.nivel_admin, r.departamento, v_tok;
end $$;
revoke all on function public.iniciar_sesion(text, text) from public;
grant execute on function public.iniciar_sesion(text, text) to anon, authenticated;
