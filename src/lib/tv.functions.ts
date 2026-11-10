import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { lerContagemStatus } from "@/lib/contagem.server";

declare const __BUILD_ID__: string;

const inputSchema = z.object({
  token: z.string().min(8).max(128),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/** Dados de uma TV: só o setor vinculado ao token, só o dia pedido. */
export const fetchTvScreen = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    const { token, date } = data;

    const { data: tv, error: tvErr } = await supabaseAdmin
      .from("tv_screens")
      .select("id, name, active, area_id")
      .eq("token", token)
      .maybeSingle();
    if (tvErr) throw new Error(tvErr.message);
    if (!tv || !tv.active) {
      throw new Error("Esta TV foi desativada ou o link é inválido.");
    }

    const [areaR, machinesR] = await Promise.all([
      supabaseAdmin.from("areas").select("id, name").eq("id", tv.area_id).maybeSingle(),
      supabaseAdmin
        .from("machines")
        .select("*")
        .eq("area_id", tv.area_id)
        .order("sort_order"),
    ]);
    if (areaR.error) throw new Error(areaR.error.message);
    if (machinesR.error) throw new Error(machinesR.error.message);

    const machines = (machinesR.data ?? []).map((m) => ({
      id: m.id,
      area_id: m.area_id,
      name: m.name,
      sort_order: m.sort_order,
      codi_maquina_id: ((m as Record<string, unknown>).codi_maquina_id as number | null | undefined) ?? null,
    }));
    const ids = machines.map((m) => m.id);
    const codiIds = machines.map((m) => m.codi_maquina_id).filter((x): x is number => x != null);
    if (!ids.length) {
      return { build: __BUILD_ID__, tvName: tv.name, areaName: areaR.data?.name ?? "", machines, goals: [], entries: [], operators: [], overtime: false, status: [], contagem: await lerContagemStatus([]) };
    }

    const [goalsR, entriesR, operatorsR, overtimeR] = await Promise.all([
      supabaseAdmin.from("production_goals").select("machine_id, goal").eq("goal_date", date).in("machine_id", ids),
      supabaseAdmin
        .from("production_entries")
        .select("machine_id, hour_slot, quantity")
        .eq("entry_date", date)
        .in("machine_id", ids),
      supabaseAdmin.from("machine_operators").select("machine_id, operator_name").eq("log_date", date).in("machine_id", ids),
      supabaseAdmin.from("overtime_days").select("enabled").eq("day", date).maybeSingle(),
    ]);
    for (const r of [goalsR, entriesR, operatorsR]) {
      if (r.error) throw new Error(r.error.message);
    }

    const [status, contagem] = await Promise.all([fetchCodiStatus(codiIds), lerContagemStatus(codiIds)]);
    return {
      status,
      // Contagem automática do CODI (só setores que estão nela) parada → faixa na TV
      contagem,
      build: __BUILD_ID__,
      tvName: tv.name,
      areaName: areaR.data?.name ?? "",
      machines,
      goals: goalsR.data ?? [],
      entries: entriesR.data ?? [],
      operators: operatorsR.data ?? [],
      overtime: !!overtimeR.data?.enabled,
    };
  });

export type CodiStatus = {
  maquina_id: number;
  estado: number | null; // 1 = produzindo, 2 = parada, null = sem sinal
  nome_parada: string | null;
  cor_tipo_parada: string | null; // hex sem #
  cor_fonte: string | null;
  estado_desde: string | null;
  atualizado_em: string | null;
};

/**
 * Status ao vivo do CODI (schema codi, gravado pelo codi-coletor).
 * Nunca derruba a TV: sem vínculo, sem coluna nova ou com erro, devolve vazio.
 */
async function fetchCodiStatus(ids: number[]): Promise<CodiStatus[]> {
  if (!ids.length) return [];
  try {
    const { data, error } = await supabaseAdmin.schema("codi" as never).from("maquinas_status" as never).select("*").in("maquina_id", ids);
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map((r) => ({
      maquina_id: r.maquina_id as number,
      estado: (r.estado as number | null) ?? null,
      nome_parada: (r.nome_parada as string | null) ?? null,
      cor_tipo_parada: (r.cor_tipo_parada as string | null) ?? null,
      cor_fonte: (r.cor_fonte as string | null) ?? null,
      estado_desde: (r.estado_desde as string | null) ?? null,
      atualizado_em: (r.atualizado_em as string | null) ?? null,
    }));
  } catch {
    return [];
  }
}
