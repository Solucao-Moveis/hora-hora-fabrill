-- Prototipagem vira tasklist do dia: tarefa deixa de ser presa a um slot de horário.
-- Executar em produção contra o schema fabrill (ver supabase-supabase.h5xdag.easypanel.host).
ALTER TABLE public.prototype_tasks DROP COLUMN hour_slot;
