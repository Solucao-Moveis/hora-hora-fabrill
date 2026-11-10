import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Batimento mais velho que isso = contagem automática parada. */
const LIMITE_MS = 3 * 60_000;

export type ContagemStatus = {
  /** Alguma das máquinas pedidas é lançada pelo CODI. */
  automatico: boolean;
  parado: boolean;
  /** Última vez que a contagem chegou certa (ISO). */
  desde: string | null;
  minutos: number;
  /** Máquinas paradas (nome), quando a falha é só de algumas. */
  maquinas: string[];
};

type SaudeRow = {
  ultimo_ok: string | null;
  maquinas: Record<string, { nome?: string; ultimo_ok?: string | null }> | null;
};

const VAZIO: ContagemStatus = { automatico: false, parado: false, desde: null, minutos: 0, maquinas: [] };

/**
 * Situação da contagem do CODI (codi.contagem_saude, gravado pelo processo
 * codi-contagem). Sem codiIds: todas as máquinas automáticas.
 * Nunca derruba a tela: qualquer erro devolve "não automático".
 */
export async function lerContagemStatus(codiIds?: number[]): Promise<ContagemStatus> {
  try {
    const { data, error } = await supabaseAdmin
      .schema("codi" as never)
      .from("contagem_saude" as never)
      .select("ultimo_ok, maquinas");
    if (error || !data) return VAZIO;

    const agora = Date.now();
    let automatico = false;
    let pior: number | null = null;
    let total = 0;
    const paradas: string[] = [];
    for (const row of data as SaudeRow[]) {
      const ids = Object.keys(row.maquinas ?? {}).map(Number);
      const alvo = codiIds ? ids.filter((i) => codiIds.includes(i)) : ids;
      if (!alvo.length) continue;
      automatico = true;
      total += alvo.length;
      const geral = row.ultimo_ok ? Date.parse(row.ultimo_ok) : 0;
      if (pior == null || geral < pior) pior = geral;
      for (const i of alvo) {
        const m = row.maquinas?.[String(i)];
        const t = m?.ultimo_ok ? Date.parse(m.ultimo_ok) : 0;
        if (agora - t > LIMITE_MS && m?.nome) paradas.push(m.nome);
        if (t < pior) pior = t;
      }
    }
    if (!automatico || pior == null) return VAZIO;
    const atraso = agora - pior;
    return {
      automatico,
      parado: atraso > LIMITE_MS,
      desde: pior > 0 ? new Date(pior).toISOString() : null,
      minutos: Math.floor(atraso / 60_000),
      // Se todas pararam, não lista (o aviso já vale pro setor inteiro)
      maquinas: paradas.length < total ? paradas : [],
    };
  } catch {
    return VAZIO;
  }
}
