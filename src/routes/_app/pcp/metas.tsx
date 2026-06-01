import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { fetchAreas, fetchMachines, fetchGoalsForDate, upsertGoal, fetchOvertime, setOvertime } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/app/DatePicker";
import { todayIso, formatDateBR } from "@/lib/time-slots";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Lock, Save } from "lucide-react";
import { toast } from "sonner";

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