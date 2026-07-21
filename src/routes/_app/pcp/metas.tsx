import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
  fetchAreas,
  fetchMachines,
  fetchGoalsForDate,
  upsertGoal,
  fetchOvertime,
  setOvertime,
  fetchPrototypeTasks,
  createPrototypeTask,
  updatePrototypeTaskStatus,
  deletePrototypeTask,
  type PrototypeTask,
} from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/app/DatePicker";
import { todayIso, formatDateBR } from "@/lib/time-slots";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Lock, Save, Plus, Trash2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/pcp/metas")({
  component: MetasPage,
});

function MetasPage() {
  const { user, isPcp, isAdmin } = useAuth();
  const [date, setDate] = useState(todayIso());
  const qc = useQueryClient();
  // Local pending edits per machine — saved in batch by the sector button
  const [pending, setPending] = useState<Record<string, number>>({});
  const [savingArea, setSavingArea] = useState<string | null>(null);

  const areasQ = useQuery({ queryKey: ["areas"], queryFn: fetchAreas });
  const machinesQ = useQuery({
    queryKey: ["machines", "all"],
    queryFn: () => fetchMachines(),
  });
  const goalsQ = useQuery({
    queryKey: ["goals", date, "all"],
    queryFn: () => fetchGoalsForDate(date),
  });
  const overtimeQ = useQuery({
    queryKey: ["overtime", date],
    queryFn: () => fetchOvertime(date),
  });

  const taskAreaIds = useMemo(
    () => (areasQ.data ?? []).filter((a) => a.mode === 'tasks').map((a) => a.id),
    [areasQ.data],
  );
  const protoTasksQ = useQuery({
    queryKey: ["prototype_tasks", taskAreaIds, date],
    queryFn: () => fetchPrototypeTasks(taskAreaIds, date),
    enabled: taskAreaIds.length > 0,
  });

  if (!isPcp && !isAdmin) return <div>Acesso restrito ao PCP.</div>;

  const totalMeta = (goalsQ.data ?? []).reduce((s, g) => s + g.goal, 0);
  const totalMachines = machinesQ.data?.length ?? 0;
  const filledCount = (goalsQ.data ?? []).filter((g) => g.goal > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Metas Diárias</h1>
          <p className="text-sm text-muted-foreground">
            Defina a meta de produção por máquina/posto — {formatDateBR(date)}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex h-10 items-center gap-2 rounded-md border bg-card px-3">
            <Switch
              id="overtime-switch"
              checked={!!overtimeQ.data}
              onCheckedChange={async (checked) => {
                try {
                  await setOvertime(date, checked, user!.id);
                  qc.invalidateQueries({ queryKey: ["overtime", date] });
                  toast.success(checked ? "Hora extra ativada (até 19h)" : "Hora extra desativada (até 17h)");
                } catch (e: unknown) {
                  const er = e as { message?: string };
                  toast.error(er.message ?? "Erro ao salvar");
                }
              }}
            />
            <Label htmlFor="overtime-switch" className="cursor-pointer text-xs">
              Hora extra (até 19h)
            </Label>
          </div>
          <Badge variant="outline" className="h-10 items-center px-3 text-sm">
            Total meta: <span className="ml-1 font-bold">{totalMeta}</span>
          </Badge>
          <Badge variant="outline" className="h-10 items-center px-3 text-sm">
            Preenchidas: <span className="ml-1 font-bold">{filledCount}/{totalMachines}</span>
          </Badge>
          <DatePicker value={date} onChange={setDate} />
        </div>
      </div>

      <div className="grid gap-4">
        {(areasQ.data ?? []).map((area) => {
          if (area.mode === 'tasks') {
            return (
              <PcpPrototipagemCard
                key={area.id}
                area={area}
                date={date}
                userId={user!.id}
                tasks={(protoTasksQ.data ?? []).filter((t) => t.area_id === area.id)}
                onChanged={() => qc.invalidateQueries({ queryKey: ["prototype_tasks", taskAreaIds, date] })}
              />
            );
          }

          const areaMachines = (machinesQ.data ?? []).filter((m) => m.area_id === area.id);
          const areaTotal = areaMachines.reduce((s, m) => {
            const g = goalsQ.data?.find((x) => x.machine_id === m.id);
            const pendingVal = pending[m.id];
            return s + (pendingVal ?? g?.goal ?? 0);
          }, 0);
          const areaHasPending = areaMachines.some((m) => pending[m.id] !== undefined);
          return (
            <Card key={area.id}>
              <CardHeader className="flex flex-row items-center justify-between bg-muted/40 py-3">
                <CardTitle className="text-base">{area.name}</CardTitle>
                <Badge variant="secondary">Total: {areaTotal}</Badge>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 pt-4 sm:grid-cols-2 lg:grid-cols-3">
                {areaMachines.map((m) => {
                  const g = goalsQ.data?.find((x) => x.machine_id === m.id);
                  const hasSavedGoal = !!g && g.goal > 0;
                  const locked = hasSavedGoal && !isAdmin;
                  return (
                    <GoalInput
                      key={m.id}
                      machineName={m.name}
                      goal={g?.goal ?? 0}
                      pendingValue={pending[m.id]}
                      locked={locked}
                      onChange={(val) =>
                        setPending((p) => ({ ...p, [m.id]: val }))
                      }
                    />
                  );
                })}
                <div className="col-span-full flex justify-end pt-2">
                  <Button
                    size="sm"
                    disabled={!areaHasPending || savingArea === area.id}
                    onClick={async () => {
                      setSavingArea(area.id);
                      try {
                        const toSave = areaMachines
                          .map((m) => ({ id: m.id, val: pending[m.id] }))
                          .filter((x) => x.val !== undefined);
                        for (const item of toSave) {
                          await upsertGoal(item.id, date, item.val!, user!.id);
                        }
                        setPending((p) => {
                          const next = { ...p };
                          for (const item of toSave) delete next[item.id];
                          return next;
                        });
                        await qc.invalidateQueries({ queryKey: ["goals", date, "all"] });
                        toast.success(`Metas de ${area.name} salvas`);
                      } catch (e: unknown) {
                        const er = e as { message?: string };
                        toast.error(er.message ?? "Erro ao salvar metas");
                      } finally {
                        setSavingArea(null);
                      }
                    }}
                  >
                    <Save className="h-4 w-4" />
                    {savingArea === area.id ? "Salvando..." : `Salvar metas de ${area.name}`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// PCP: visualização/adição de tarefas da Prototipagem (tasklist do dia)
// ──────────────────────────────────────────────────────────

function PcpPrototipagemCard({
  area,
  date,
  userId,
  tasks,
  onChanged,
}: {
  area: { id: string; name: string };
  date: string;
  userId: string;
  tasks: PrototypeTask[];
  onChanged: () => void;
}) {
  const [newDesc, setNewDesc] = useState("");
  const [adding, setAdding] = useState(false);

  const feitas = tasks.filter((t) => t.status === 'feito').length;
  const incompletas = tasks.filter((t) => t.status === 'incompleto').length;
  const naoFeitas = tasks.filter((t) => t.status === 'nao_feito').length;

  const add = async () => {
    if (!newDesc.trim()) return;
    setAdding(true);
    try {
      await createPrototypeTask(area.id, date, newDesc, userId);
      setNewDesc("");
      onChanged();
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(err.message ?? "Erro ao adicionar tarefa");
    } finally {
      setAdding(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 bg-muted/40 py-3">
        <CardTitle className="text-base">{area.name}</CardTitle>
        <div className="flex gap-2">
          <Badge variant="secondary">{feitas}/{tasks.length} feitas</Badge>
          {incompletas > 0 && <Badge className="bg-warning text-warning-foreground">{incompletas} incompletas</Badge>}
          {naoFeitas > 0 && <Badge variant="destructive">{naoFeitas} não feitas</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-1 pt-4">
        {tasks.map((task) => (
          <PcpProtoTaskRow key={task.id} task={task} userId={userId} onChanged={onChanged} />
        ))}
        <div className="flex gap-2 pt-1">
          <Input
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="Adicionar tarefa do dia..."
            className="h-8 text-sm"
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 shrink-0"
            disabled={adding || !newDesc.trim()}
            onClick={add}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PcpProtoTaskRow({
  task,
  userId,
  onChanged,
}: {
  task: PrototypeTask;
  userId: string;
  onChanged: () => void;
}) {
  const statusIcon = {
    nao_feito: <XCircle className="h-3.5 w-3.5 text-destructive" />,
    incompleto: <AlertCircle className="h-3.5 w-3.5 text-warning" />,
    feito: <CheckCircle2 className="h-3.5 w-3.5 text-success" />,
  }[task.status];

  const statusLabel = { nao_feito: "Não feito", incompleto: "Incompleto", feito: "Feito" }[task.status];

  const remove = async () => {
    if (!confirm(`Remover "${task.description}"?`)) return;
    try {
      await deletePrototypeTask(task.id);
      onChanged();
    } catch (e: unknown) {
      const err = e as { message?: string };
      toast.error(err.message ?? "Erro ao remover");
    }
  };

  return (
    <div className="flex items-start gap-2 rounded border bg-card px-2 py-1">
      <span className="mt-0.5 shrink-0" title={statusLabel}>{statusIcon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-xs">{task.description}</p>
        {task.status === 'incompleto' && task.observation && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{task.observation}</p>
        )}
      </div>
      <button
        type="button"
        onClick={remove}
        className="shrink-0 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

function GoalInput({
  machineName,
  goal,
  pendingValue,
  locked,
  onChange,
}: {
  machineName: string;
  goal: number;
  pendingValue: number | undefined;
  locked: boolean;
  onChange: (v: number) => void;
}) {
  const displayVal = pendingValue !== undefined ? String(pendingValue) : String(goal);
  const [val, setVal] = useState<string>(displayVal);
  useEffect(() => setVal(displayVal), [displayVal]);

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">{machineName}</div>
        {locked && (
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            <Lock className="h-3 w-3" /> bloqueada
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Meta</span>
        <Input
          type="number"
          min={0}
          inputMode="numeric"
          value={val}
          disabled={locked}
          onChange={(e) => {
            setVal(e.target.value);
            const num = Number(e.target.value);
            if (!Number.isNaN(num) && num >= 0) onChange(num);
          }}
          className="h-10 text-center font-bold"
        />
      </div>
      {locked && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Somente um administrador pode alterar uma meta já salva.
        </p>
      )}
    </div>
  );
}