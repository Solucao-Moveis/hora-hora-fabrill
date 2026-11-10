import { AlertTriangle } from "lucide-react";
import type { ContagemStatus } from "@/lib/contagem.functions";
import { cn } from "@/lib/utils";

function horaLocal(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Faixa de "contagem automática parada": o líder lança manual até voltar. */
export function ContagemAviso({ status, className }: { status: ContagemStatus | undefined; className?: string }) {
  if (!status?.parado) return null;
  const quais = status.maquinas.length ? ` (${status.maquinas.join(", ")})` : "";
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <div className="font-bold">
          Contagem automática do CODI parada{status.desde ? ` desde ${horaLocal(status.desde)}` : ""}
          {quais}
        </div>
        <div className="text-destructive/80">
          Lance as horas manualmente aqui. Quando o CODI voltar, as horas que ficarem vazias são completadas sozinhas.
        </div>
      </div>
    </div>
  );
}
