import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
  fetchMachines,
  fetchGoalsForDate,
  fetchOperatorsForDate,
  fetchEntriesForDate,
  upsertOperator,
  upsertEntry,
  type Machine,
} from "@/lib/queries";
import { todayIso, formatDateBR, getApontamentoSlots } from "@/lib/time-slots";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/app/DatePicker";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/lider/")({
  component: LiderPage,
});

function LiderPage() {
  const { user, areas, isLider } = useAuth();
  const [date, setDate] = useState(todayIso());
  const qc = useQueryClient();
  const areaIds = useMemo(() => areas.map((a) => a.id), [areas]);

  const machinesQ = useQuery({
    queryKey: ["machines", areaIds],
    queryFn: () => fetchMachines(areaIds),
    enabled: areaIds.length > 0,
  });
  const machineIds = useMemo(() => (machinesQ.data ?? []).map((m) => m.id), [machinesQ.data]);

  const goalsQ = useQuery({
    queryKey: ["goals", date, machineIds],
    queryFn: () => fetchGoalsForDate(date, machineIds),
    enabled: machineIds.length > 0,
  });
  const operatorsQ = useQuery({
    queryKey: ["operators", date, machineIds],
    queryFn: () => fetchOperatorsForDate(date, machineIds),
    enabled: machineIds.length > 0,
  });
  const entriesQ = useQuery({
    queryKey: ["entries", date, machineIds],
    queryFn: () => fetchEntriesForDate(date, machineIds),
    enabled: machineIds.length > 0,
  });

  if (!isLider) {
    return (
      <div className="text-muted-foreground">Você não tem permissão de líder.</div>
    );
  }
  if (areas.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        Nenhuma área atribuída ao seu usuário. Solicite ao PCP para vincular sua área.
      </div>
    );
  }

  const machines = machinesQ.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Apontamento Horário</h1>
          <p className="text-sm text-muted-foreground">
            {areas.map((a) => a.name).join(" · ")} — {formatDateBR(date)}
          </p>
        </div>
        <DatePicker value={date} onChange={setDate} />
      </div>

      <div className="grid gap-4">
        {areas.map((area) => {
          const areaMachines = machines.filter((m) => m.area_id === area.id);
          if (!areaMachines.length) return null;
          return (
            <div key={area.id} className="space-y-3">
              <h2 className="text-lg font-semibold">{area.name}</h2>
              <div className="grid gap-4">
                {areaMachines.map((m) => (
                  <MachineCard
                    key={m.id}
                    machine={m}
                    date={date}
                    userId={user!.id}
                    goal={goalsQ.data?.find((g) => g.machine_id === m.id)?.goal ?? 0}
                    operator={operatorsQ.data?.find((o) => o.machine_id === m.id)?.operator_name ?? ""}
                    entries={(entriesQ.data ?? []).filter((e) => e.machine_id === m.id)}
                    onChanged={() => {
                      qc.invalidateQueries({ queryKey: ["entries", date, machineIds] });
                      qc.invalidateQueries({ queryKey: ["operators", date, machineIds] });
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MachineCard({
  machine,
  date,
  userId,
  goal,
  operator,
  entries,
  onChanged,
}: {
  machine: Machine;
  date: string;
  userId: string;
  goal: number;
  operator: string;
  entries: { hour_slot: number; quantity: number; observation: string | null }[];
  onChanged: () => void;
}) {
  const [op, setOp] = useState(operator);
  useEffect(() => setOp(operator), [operator]);

  const total = entries.reduce((s, e) => s + (e.quantity || 0), 0);
  const pct = goal > 0 ? Math.round((total / goal) * 100) : 0;

  const saveOperator = async () => {
    if (op.trim() === operator.trim()) return;
    try {
      await upsertOperator(machine.id, date, op.trim());
      toast.success("Operador salvo");
      onChanged();
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(err.message ?? "Erro ao salvar operador");
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 bg-muted/40 py-3">
        <CardTitle className="text-base">{machine.name}</CardTitle>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="bg-card text-xs">
            META: <span className="ml-1 font-bold">{goal}</span>
          </Badge>
          <Badge
            className={cn(
              "text-xs",
              pct >= 100
                ? "bg-success text-success-foreground"
                : pct >= 70
                ? "bg-warning text-warning-foreground"
                : "bg-destructive text-destructive-foreground",
            )}
          >
            {total} / {goal} ({pct}%)
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px] space-y-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Operador</Label>
            <Input
              value={op}
              onChange={(e) => setOp(e.target.value)}
              onBlur={saveOperator}
              placeholder="Nome do operador"
              className="h-10"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {getApontamentoSlots(date).map((slot) => {
            const e = entries.find((x) => x.hour_slot === slot.index);
            return (
              <SlotInput
                key={slot.index}
                slot={slot.label}
                quantity={e?.quantity ?? null}
                observation={e?.observation ?? ""}
                onSave={async (q, obs) => {
                  try {
                    await upsertEntry(machine.id, date, slot.index, q, obs.trim() || null, userId);
                    onChanged();
                  } catch (err: unknown) {
                    const er = err as { message?: string };
                    toast.error(er.message ?? "Erro ao salvar lançamento");
                  }
                }}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function SlotInput({
  slot,
  quantity,
  observation,
  onSave,
}: {
  slot: string;
  quantity: number | null;
  observation: string;
  onSave: (q: number, obs: string) => Promise<void>;
}) {
  const [q, setQ] = useState<string>(quantity != null ? String(quantity) : "");
  const [obs, setObs] = useState<string>(observation);
  useEffect(() => setQ(quantity != null ? String(quantity) : ""), [quantity]);
  useEffect(() => setObs(observation), [observation]);

  const save = async () => {
    const num = Number(q);
    if (q === "" || Number.isNaN(num) || num < 0) return;
    if (num === (quantity ?? -1) && obs === observation) return;
    await onSave(num, obs);
  };

  const isEmpty = quantity == null;
  return (
    <div
      className={cn(
        "rounded-lg border p-2 transition-colors",
        isEmpty ? "border-dashed bg-muted/30" : "bg-card",
      )}
    >
      <div className="text-[11px] font-semibold text-muted-foreground">{slot}</div>
      <Input
        type="number"
        min={0}
        inputMode="numeric"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onBlur={save}
        placeholder="0"
        className="h-12 text-center text-lg font-bold"
      />
      <Input
        value={obs}
        onChange={(e) => setObs(e.target.value)}
        onBlur={save}
        placeholder="obs."
        className="mt-1 h-7 text-[11px]"
      />
    </div>
  );
}