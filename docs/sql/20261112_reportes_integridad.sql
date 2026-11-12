-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261112 · Integridad de public.reportes.huerta_id (panel AVOTEX Admin)
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Cómo ejecutarlo: Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
-- Se puede ejecutar más de una vez.
--
-- NO agrega columnas: public.reportes.huerta_id YA EXISTE y no se toca su definición.
-- NO modifica ni borra filas: los reportes históricos con huerta_id NULL se conservan
-- (el panel los muestra como «Sin huerta asignada»).
--
-- Qué hace:
--   1. Función public.avx_huerta_del_mismo_usuario() — la MISMA de la migración 20261108 de la app
--      (scans/recorridos). Se repite aquí para que este archivo funcione aunque aquella no se haya
--      ejecutado; si ya existe, se reemplaza por el mismo código.
--   2. Trigger en reportes: huerta_id debe ser NULL o una huerta con el MISMO user_email.
--      Así, aunque alguien inserte con la clave anon (modo directo del panel), la base rechaza
--      reportes asignados a la huerta de otro cliente.
--   3. Llave foránea reportes.huerta_id → huertas(id) ON DELETE SET NULL, solo si no existe ninguna
--      sobre esa columna. Se crea NOT VALID: aplica a filas nuevas/actualizadas y NO revisa ni toca
--      las existentes (revísalas con el diagnóstico de abajo y valida después si quieres).
--   4. Índice para listar reportes por huerta.
-- ════════════════════════════════════════════════════════════════════════════════════════════════

-- 1. Función de pertenencia ─────────────────────────────────────────────────────────────────────
create or replace function public.avx_huerta_del_mismo_usuario()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.huerta_id is not null and not exists (
    select 1 from public.huertas h
    where h.id = new.huerta_id
      and new.user_email is not null
      and h.user_email = new.user_email
  ) then
    raise exception 'La huerta % no pertenece a %', new.huerta_id, coalesce(new.user_email, '(sin correo)')
      using errcode = '23503', hint = 'Usa una huerta del mismo user_email o NULL.';
  end if;
  return new;
end;
$$;

-- 2. Trigger en reportes ────────────────────────────────────────────────────────────────────────
drop trigger if exists reportes_huerta_del_usuario on public.reportes;
create trigger reportes_huerta_del_usuario
  before insert or update of huerta_id, user_email on public.reportes
  for each row execute function public.avx_huerta_del_mismo_usuario();

-- 3. Llave foránea (no se duplica; NOT VALID = no revisa filas existentes) ──────────────────────
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.reportes'::regclass
      and c.contype = 'f'
      and a.attname = 'huerta_id'
  ) then
    alter table public.reportes
      add constraint reportes_huerta_id_fkey
      foreign key (huerta_id) references public.huertas(id) on delete set null
      not valid;
  end if;
end $$;

-- 4. Índice ─────────────────────────────────────────────────────────────────────────────────────
create index if not exists idx_reportes_huerta on public.reportes (huerta_id) where huerta_id is not null;
create index if not exists idx_reportes_user_fecha on public.reportes (user_email, created_at desc);

-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- DIAGNÓSTICO (solo lectura; ejecutar cada consulta por separado). Ninguna modifica datos.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- Reportes sin huerta (históricos):
--   select count(*) from public.reportes where huerta_id is null;
-- Reportes cuya huerta es de OTRO usuario o ya no existe (deberían ser 0):
--   select r.id, r.user_email, r.huerta_id, h.user_email as dueno_huerta
--     from public.reportes r left join public.huertas h on h.id = r.huerta_id
--    where r.huerta_id is not null and (h.id is null or h.user_email is distinct from r.user_email);
-- Lo mismo para escaneos, recorridos y hallazgos:
--   select 'scans' t, count(*) from public.scans s left join public.huertas h on h.id = s.huerta_id
--    where s.huerta_id is not null and (h.id is null or h.user_email is distinct from s.user_email)
--   union all
--   select 'recorridos', count(*) from public.recorridos r left join public.huertas h on h.id = r.huerta_id
--    where r.huerta_id is not null and (h.id is null or h.user_email is distinct from r.user_email)
--   union all
--   select 'hallazgos≠recorrido', count(*) from public.hallazgos x join public.recorridos r on r.id = x.recorrido_id
--    where x.huerta_id is distinct from r.huerta_id;
-- Si todo da 0, puedes validar la llave foránea (revisa filas existentes, no las cambia):
--   alter table public.reportes validate constraint reportes_huerta_id_fkey;
-- Triggers instalados:
--   select event_object_table, trigger_name from information_schema.triggers
--    where trigger_name like '%huerta%' order by 1, 2;
