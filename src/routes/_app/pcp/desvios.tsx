import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { fetchAreas, fetchMachines } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, Plus, Image as ImageIcon, X } from "lucide-react";
import { todayIso, formatDateBR } from "@/lib/time-slots";

export const Route = createFileRoute("/_app/pcp/desvios")({
  component: DesviosPage,
});

type Deviation = {
  id: string;
  deviation_date: string;
  deviation_time: string;
  area_id: string;
  machine_id: string | null;
  item_code: string;
  quantity: number;
  piece_weight: number;
  total_weight: number;
  deviation: string;
  operator_name: string | null;
  action_plan: string | null;
  action_responsible: string | null;
  photos: string[];
  created_at: string;
};

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function DesviosPage() {
  const { user, isPcp, isQualidade } = useAuth();
  const qc = useQueryClient();
  const canEdit = isQualidade;
  const canView = isPcp || isQualidade;

  const areasQ = useQuery({ queryKey: ["areas"], queryFn: fetchAreas });
  const machinesQ = useQuery({ queryKey: ["machines", "all"], queryFn: () => fetchMachines() });
  const listQ = useQuery({
    queryKey: ["deviations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_deviations")
        .select("*")
        .order("deviation_date", { ascending: false })
        .order("deviation_time", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Deviation[];
    },
    enabled: canView,
  });

  if (!canView) return <div>Acesso restrito a Qualidade e PCP.</div>;

  const areaName = (id: string) => areasQ.data?.find((a) => a.id === id)?.name ?? "—";
  const machineName = (id: string | null) =>
    machinesQ.data?.find((m) => m.id === id)?.name ?? "—";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Desvios de Produção</h1>
          <p className="text-sm text-muted-foreground">
            {canEdit
              ? "Registre desvios de produção, plano de ação e fotos de evidência."
              : "Visualização dos desvios registrados pela Qualidade."}
          </p>
        </div>
      </div>

      {canEdit && (
        <DeviationForm
          areas={areasQ.data ?? []}
          machines={machinesQ.data ?? []}
          userId={user!.id}
          onSaved={() => qc.invalidateQueries({ queryKey: ["deviations"] })}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(listQ.data ?? []).length === 0 && (
            <div className="text-sm text-muted-foreground">Nenhum desvio registrado.</div>
          )}
          {(listQ.data ?? []).map((d) => (
            <DeviationRow
              key={d.id}
              d={d}
              areaName={areaName(d.area_id)}
              machineName={machineName(d.machine_id)}
              canEdit={canEdit}
              onChanged={() => qc.invalidateQueries({ queryKey: ["deviations"] })}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function DeviationForm({
  areas, machines, userId, onSaved,
}: {
  areas: { id: string; name: string }[];
  machines: { id: string; area_id: string; name: string }[];
  userId: string;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState(nowHHMM());
  const [areaId, setAreaId] = useState<string>("");
  const [machineId, setMachineId] = useState<string>("");
  const [itemCode, setItemCode] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [pieceWeight, setPieceWeight] = useState("0");
  const [deviation, setDeviation] = useState("");
  const [operator, setOperator] = useState("");
  const [actionPlan, setActionPlan] = useState("");
  const [responsible, setResponsible] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);

  const filteredMachines = useMemo(
    () => machines.filter((m) => !areaId || m.area_id === areaId),
    [machines, areaId],
  );

  const totalWeight = (Number(quantity) || 0) * (Number(pieceWeight) || 0);

  const reset = () => {
    setDate(todayIso()); setTime(nowHHMM());
    setAreaId(""); setMachineId(""); setItemCode("");
    setQuantity("0"); setPieceWeight("0"); setDeviation("");
    setOperator(""); setActionPlan(""); setResponsible(""); setFiles([]);
    setFileInputKey((k) => k + 1);
  };

  const submit = async () => {
    if (!areaId) return toast.error("Selecione o setor");
    if (!itemCode.trim()) return toast.error("Informe o código do item");
    if (!deviation.trim()) return toast.error("Descreva o desvio");
    setSaving(true);
    try {
      // Upload photos
      const photoUrls: string[] = [];
      for (const f of files) {
        const ext = f.name.split(".").pop() || "jpg";
        const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const up = await supabase.storage.from("deviation-photos").upload(path, f, {
          contentType: f.type, upsert: false,
        });
        if (up.error) throw up.error;
        const { data: pub } = supabase.storage.from("deviation-photos").getPublicUrl(path);
        photoUrls.push(pub.publicUrl);
      }

      const { error } = await supabase.from("production_deviations").insert({
        deviation_date: date,
        deviation_time: time,
        area_id: areaId,
        machine_id: machineId || null,
        item_code: itemCode.trim(),
        quantity: Number(quantity) || 0,
        piece_weight: Number(pieceWeight) || 0,
        deviation: deviation.trim(),
        operator_name: operator.trim() || null,
        action_plan: actionPlan.trim() || null,
        action_responsible: responsible.trim() || null,
        photos: photoUrls,
        created_by: userId,
      });
      if (error) throw error;
      toast.success("Desvio registrado");
      reset();
      onSaved();
    } catch (e: unknown) {
      const er = e as { message?: string };
      toast.error(er.message ?? "Erro ao salvar desvio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Plus className="h-4 w-4" /> Novo desvio
        </CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Data">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Hora">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Setor">
          <Select value={areaId} onValueChange={(v) => { setAreaId(v); setMachineId(""); }}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Máquina">
          <Select value={machineId} onValueChange={setMachineId} disabled={!areaId}>
            <SelectTrigger><SelectValue placeholder={areaId ? "Selecione" : "Selecione setor antes"} /></SelectTrigger>
            <SelectContent>
              {filteredMachines.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Código do item">
          <Input value={itemCode} onChange={(e) => setItemCode(e.target.value)} placeholder="Ex: AB-1234" />
        </Field>
        <Field label="Operador">
          <Input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="Nome do operador" />
        </Field>
        <Field label="Quantidade">
          <Input type="number" min={0} step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </Field>
        <Field label="Peso da peça (kg)">
          <Input type="number" min={0} step="any" value={pieceWeight} onChange={(e) => setPieceWeight(e.target.value)} />
        </Field>
        <Field label="Peso total (kg)">
          <Input value={totalWeight.toFixed(3)} readOnly disabled className="bg-muted/40 font-semibold" />
        </Field>
        <Field label="Desvio" className="sm:col-span-2 lg:col-span-3">
          <Textarea rows={2} value={deviation} onChange={(e) => setDeviation(e.target.value)} placeholder="Descreva o desvio detectado" />
        </Field>
        <Field label="Plano de ação" className="sm:col-span-2 lg:col-span-2">
          <Textarea rows={2} value={actionPlan} onChange={(e) => setActionPlan(e.target.value)} placeholder="Ação corretiva / preventiva" />
        </Field>
        <Field label="Responsável pela ação">
          <Input value={responsible} onChange={(e) => setResponsible(e.target.value)} placeholder="Nome do responsável" />
        </Field>
        <Field label="Fotos" className="sm:col-span-2 lg:col-span-3">
          <Input
            key={fileInputKey}
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
          {files.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {files.map((f, i) => (
                <Badge key={i} variant="outline" className="gap-1">
                  <ImageIcon className="h-3 w-3" />{f.name}
                </Badge>
              ))}
            </div>
          )}
        </Field>
        <div className="sm:col-span-2 lg:col-span-3 flex justify-end gap-2">
          <Button variant="outline" onClick={reset} disabled={saving}>Limpar</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Salvando…" : "Salvar desvio"}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={"space-y-1 " + (className ?? "")}>
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function DeviationRow({
  d, areaName, machineName, canEdit, onChanged,
}: {
  d: Deviation;
  areaName: string;
  machineName: string;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);

  const remove = async () => {
    if (!confirm("Excluir este desvio?")) return;
    const { error } = await supabase.from("production_deviations").delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    toast.success("Desvio excluído");
    onChanged();
  };

  return (
    <div className="rounded border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
      >
        <Badge variant="outline">{formatDateBR(d.deviation_date)} {d.deviation_time.slice(0, 5)}</Badge>
        <span className="text-sm font-medium">{areaName}</span>
        <span className="text-xs text-muted-foreground">· {machineName}</span>
        <span className="text-xs">Item: <strong>{d.item_code}</strong></span>
        <span className="text-xs">Qtd: {d.quantity} · Peso: {Number(d.total_weight).toFixed(3)} kg</span>
        <span className="ml-auto text-xs text-muted-foreground line-clamp-1 max-w-[260px]">{d.deviation}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t px-3 py-3 text-sm">
          <div><span className="text-muted-foreground">Operador:</span> {d.operator_name || "—"}</div>
          <div><span className="text-muted-foreground">Desvio:</span> {d.deviation}</div>
          <div><span className="text-muted-foreground">Plano de ação:</span> {d.action_plan || "—"}</div>
          <div><span className="text-muted-foreground">Responsável:</span> {d.action_responsible || "—"}</div>
          {d.photos.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {d.photos.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer">
                  <img src={url} alt={`foto ${i + 1}`} className="h-24 w-24 rounded object-cover border" />
                </a>
              ))}
            </div>
          )}
          {canEdit && (
            <div className="flex justify-end pt-2">
              <Button variant="ghost" size="sm" onClick={remove}>
                <Trash2 className="mr-1 h-4 w-4 text-destructive" /> Excluir
              </Button>
            </div>
          )}
          <X className="hidden" />
        </div>
      )}
    </div>
  );
}