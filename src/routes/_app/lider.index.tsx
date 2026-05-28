import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
  fetchMachines,
  fetchGoalsForDate,
  fetchOperatorsForDate,
  fetchEntriesForDate,
  fetchJustificationsForDate,
  fetchOvertime,
  setOperatorsForDate,
  upsertEntry,
  upsertJustification,
  fetchCollaborators,
  createCollaborator,
  updateCollaborator,
  deleteCollaborator,
  type Collaborator,
  type Machine,
} from "@/lib/queries";
import { todayIso, formatDateBR, getApontamentoSlots, effectiveDayGoal } from "@/lib/time-slots";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/app/DatePicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, UserMinus, UserCheck } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CollaboratorMultiSelect } from "@/components/app/CollaboratorMultiSelect";
import type { AreaRef } from "@/lib/auth-context";

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
  const justifQ = useQuery({
    queryKey: ["justifications", date, machineIds],
    queryFn: () => fetchJustificationsForDate(date, machineIds),
    enabled: machineIds.length > 0,
  });
  const overtimeQ = useQuery({
    queryKey: ["overtime", date],
    queryFn: () => fetchOvertime(date),
  });
  const collaboratorsQ = useQuery({
    queryKey: ["collaborators", areaIds],
    queryFn: () => fetchCollaborators(areaIds),
    enabled: areaIds.length > 0,
  });
  const overtime = !!overtimeQ.data;

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
  const activeCollabs = (collaboratorsQ.data ?? []).filter((c) => c.active);

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

      <CollaboratorsCard
        areas={areas}
        collaborators={collaboratorsQ.data ?? []}
        onChanged={() => qc.invalidateQueries({ queryKey: ["collaborators", areaIds] })}
      />

      <div className="grid gap-4">
        {areas.map((area) => {
          const areaMachines = machines.filter((m) => m.area_id === area.id);
          if (!areaMachines.length) return null;
          const areaOptions = activeCollabs
            .filter((c) => c.area_id === area.id)
            .map((c) => c.name);
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
                    goal={effectiveDayGoal(
                      goalsQ.data?.find((g) => g.machine_id === m.id)?.goal ?? 0,
                      overtime,
                      date,
                    )}
                    collaboratorOptions={areaOptions}
                    operators={(operatorsQ.data ?? [])
                      .filter((o) => o.machine_id === m.id)
                      .map((o) => (o.operator_name ?? "").trim())
                      .filter((n) => n.length > 0)}
                    entries={(entriesQ.data ?? []).filter((e) => e.machine_id === m.id)}
                    justification={
                      justifQ.data?.find((j) => j.machine_id === m.id)?.justification ?? ""
                    }
                    onChanged={() => {
                      qc.invalidateQueries({ queryKey: ["entries", date, machineIds] });
                      qc.invalidateQueries({ queryKey: ["operators", date, machineIds] });
                      qc.invalidateQueries({ queryKey: ["justifications", date, machineIds] });
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

function CollaboratorsCard({
  areas,
  collaborators,
  onChanged,
}: {
  areas: AreaRef[];
  collaborators: Collaborator[];
  onChanged: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [newArea, setNewArea] = useState<string>(areas[0]?.id ?? "");
  useEffect(() => {
    if (!newArea && areas[0]) setNewArea(areas[0].id);
  }, [areas, newArea]);

  const add = async () => {
    if (!newName.trim() || !newArea) return;
    try {
      await createCollaborator(newArea, newName);
      setNewName("");
      toast.success("Colaborador cadastrado");
      onChanged();
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(err.message ?? "Erro ao cadastrar colaborador");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Colaboradores da minha área</CardTitle>
        <p className="text-xs text-muted-foreground">
          Cadastre aqui os colaboradores da sua equipe. Eles ficam disponíveis na lista
          suspensa do apontamento de cada máquina.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[200px] space-y-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Nome</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome do colaborador"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
              className="h-10"
            />
          </div>
          {areas.length > 1 && (
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Área</Label>
              <Select value={newArea} onValueChange={setNewArea}>
                <SelectTrigger className="h-10 w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {areas.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button type="button" onClick={add} className="h-10 gap-2">
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {areas.map((area) => {
            const items = collaborators.filter((c) => c.area_id === area.id);
            return (
              <div key={area.id} className="rounded-lg border bg-card p-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {area.name} · {items.filter((c) => c.active).length} ativos
                </div>
                {items.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    Nenhum colaborador cadastrado.
                  </div>
                ) : (
                  <ul className="space-y-1">
                    {items.map((c) => (
                      <CollaboratorRow key={c.id} item={c} onChanged={onChanged} />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function CollaboratorRow({ item, onChanged }: { item: Collaborator; onChanged: () => void }) {
  const [name, setName] = useState(item.name);
  useEffect(() => setName(item.name), [item.name]);

  const saveName = async () => {
    if (name.trim() === item.name.trim() || !name.trim()) {
      setName(item.name);
      return;
    }
    try {
      await updateCollaborator(item.id, { name });
      toast.success("Nome atualizado");
      onChanged();
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(err.message ?? "Erro ao atualizar");
      setName(item.name);
    }
  };

  const toggleActive = async () => {
    try {
      await updateCollaborator(item.id, { active: !item.active });
      onChanged();
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(err.message ?? "Erro ao atualizar");
    }
  };

  const remove = async () => {
    if (!confirm(`Remover "${item.name}"?`)) return;
    try {
      await deleteCollaborator(item.id);
      toast.success("Colaborador removido");
      onChanged();
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(err.message ?? "Erro ao remover");
    }
  };

  return (
    <li className={cn("flex items-center gap-1", !item.active && "opacity-60")}>
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={saveName}
        className="h-8 text-sm"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={toggleActive}
        title={item.active ? "Desativar" : "Reativar"}
      >
        {item.active ? (
          <UserMinus className="h-4 w-4" />
        ) : (
          <UserCheck className="h-4 w-4" />
        )}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-destructive"
        onClick={remove}
        title="Remover"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}

function MachineCard({
  machine,
  date,
  userId,
  goal,
  collaboratorOptions,
  operators,
  entries,
  justification,
  onChanged,
}: {
  machine: Machine;
  date: string;
  userId: string;
  goal: number;
  collaboratorOptions: string[];
  operators: string[];
  entries: { hour_slot: number; quantity: number; observation: string | null }[];
  justification: string;
  onChanged: () => void;
}) {
  const [selectedOps, setSelectedOps] = useState<string[]>(operators);
  const opsKey = operators.join("|");
  useEffect(() => {
    setSelectedOps(operators);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opsKey]);

  const [just, setJust] = useState(justification);
  useEffect(() => setJust(justification), [justification]);

  const total = entries.reduce((s, e) => s + (e.quantity || 0), 0);
  const pct = goal > 0 ? Math.round((total / goal) * 100) : 0;

  const saveOperators = async (next: string[]) => {
    setSelectedOps(next);
    const a = [...next].map((s) => s.trim()).sort().join("|");
    const b = [...operators].map((s) => s.trim()).sort().join("|");
    if (a === b) return;
    try {
      await setOperatorsForDate(machine.id, date, next);
      toast.success("Colaboradores salvos");
      onChanged();
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(err.message ?? "Erro ao salvar colaboradores");
    }
  };

  const saveJustification = async () => {
    if (just.trim() === justification.trim()) return;
    try {
      await upsertJustification(machine.id, date, just.trim(), userId);
      toast.success("Justificativa salva");
      onChanged();
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(err.message ?? "Erro ao salvar justificativa");
    }
  };

  const metaNotMet = goal > 0 && total < goal;

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
          <div className="flex-1 min-w-[260px] space-y-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Colaboradores (pode selecionar mais de um)
            </Label>
            <CollaboratorMultiSelect
              options={collaboratorOptions}
              selected={selectedOps}
              onChange={saveOperators}
              placeholder={
                collaboratorOptions.length === 0
                  ? "Cadastre colaboradores acima"
                  : "Selecionar colaboradores"
              }
              disabled={collaboratorOptions.length === 0}
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
        <div className="space-y-1">
          <Label
            className={cn(
              "text-xs uppercase tracking-wide",
              metaNotMet ? "text-destructive" : "text-muted-foreground",
            )}
          >
            Justificativa (caso a meta do dia não seja cumprida)
            {metaNotMet && !just.trim() && (
              <span className="ml-2 normal-case">— pendente</span>
            )}
          </Label>
          <Textarea
            value={just}
            onChange={(e) => setJust(e.target.value)}
            onBlur={saveJustification}
            placeholder="Ex.: parada por manutenção, falta de material, etc."
            rows={2}
            className="resize-none"
          />
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