import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAreas } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, ExternalLink, Trash2, Tv } from "lucide-react";

export const Route = createFileRoute("/_app/pcp/tv")({
  component: TvAdminPage,
});

type TvScreen = { id: string; area_id: string; name: string; token: string; active: boolean; created_at: string };

function generateToken(): string {
  const arr = new Uint8Array(18);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function tvUrl(token: string): string {
  return `${window.location.origin}/tv/${token}`;
}

function TvAdminPage() {
  const qc = useQueryClient();
  const [areaId, setAreaId] = useState("");
  const [name, setName] = useState("");

  const areasQ = useQuery({ queryKey: ["areas"], queryFn: fetchAreas });
  const areas = (areasQ.data ?? []).filter((a) => a.mode === "production");
  const screensQ = useQuery({
    queryKey: ["tv-screens"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tv_screens")
        .select("id, area_id, name, token, active, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as TvScreen[];
    },
  });
  const screens = screensQ.data ?? [];

  const create = async () => {
    if (!areaId) return toast.error("Escolha o setor");
    const area = areas.find((a) => a.id === areaId);
    const finalName = name.trim() || `TV ${area?.name ?? ""}`.trim();
    const { error } = await supabase
      .from("tv_screens")
      .insert({ area_id: areaId, name: finalName, token: generateToken(), active: true });
    if (error) return toast.error(error.message);
    toast.success("TV criada. Copie o link e abra na TV.");
    setName("");
    qc.invalidateQueries({ queryKey: ["tv-screens"] });
  };

  const toggleActive = async (s: TvScreen) => {
    const { error } = await supabase.from("tv_screens").update({ active: !s.active }).eq("id", s.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["tv-screens"] });
  };

  const remove = async (s: TvScreen) => {
    if (!confirm(`Excluir "${s.name}"? A TV que estiver com esse link para de funcionar.`)) return;
    const { error } = await supabase.from("tv_screens").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["tv-screens"] });
  };

  const copy = async (s: TvScreen) => {
    await navigator.clipboard.writeText(tvUrl(s.token));
    toast.success("Link copiado");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">TV do setor</h1>
        <p className="text-sm text-muted-foreground">
          Gere um link para deixar o mapa de calor de um setor aberto numa TV. Abre sem login e atualiza sozinho a cada 5 segundos.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova TV</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Setor</Label>
              <Select value={areaId} onValueChange={setAreaId}>
                <SelectTrigger className="h-10 w-full sm:w-[220px]">
                  <SelectValue placeholder="Escolha o setor" />
                </SelectTrigger>
                <SelectContent>
                  {areas.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[200px] flex-1 space-y-1">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Nome (opcional)</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: TV Solda, TV corredor…"
                className="h-10"
              />
            </div>
            <Button onClick={create} className="h-10 gap-2">
              <Tv className="h-4 w-4" /> Gerar TV
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">TVs criadas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {screensQ.isError && (
            <div className="text-sm text-destructive">{(screensQ.error as Error).message}</div>
          )}
          {!screensQ.isError && screens.length === 0 && (
            <div className="text-sm text-muted-foreground">Nenhuma TV criada ainda.</div>
          )}
          {screens.map((s) => {
            const area = areasQ.data?.find((a) => a.id === s.area_id);
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Tv className="h-5 w-5" />
                </div>
                <div className="min-w-[180px] flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{s.name}</span>
                    <Badge variant="outline">{area?.name ?? "setor removido"}</Badge>
                    {s.active ? <Badge variant="secondary">Ativa</Badge> : <Badge variant="outline">Desativada</Badge>}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                    {tvUrl("•".repeat(12))}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => copy(s)}>
                  <Copy className="mr-1 h-4 w-4" /> Copiar link
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={tvUrl(s.token)} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-1 h-4 w-4" /> Abrir
                  </a>
                </Button>
                <Button variant="outline" size="sm" onClick={() => toggleActive(s)}>
                  {s.active ? "Desativar" : "Ativar"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(s)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
