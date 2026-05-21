import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAreas } from "@/lib/queries";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useState } from "react";
import { Copy, Trash2, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/_app/pcp/usuarios")({
  component: UsuariosPage,
});

type Profile = { id: string; email: string | null; full_name: string | null };
type RoleRow = { user_id: string; role: "pcp" | "lider" };
type UserAreaRow = { user_id: string; area_id: string };
type ViewerToken = { id: string; token: string; name: string; active: boolean; created_at: string };

function generateToken(): string {
  const arr = new Uint8Array(18);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

function ViewerTokensSection() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [showToken, setShowToken] = useState<Record<string, boolean>>({});

  const tokensQ = useQuery({
    queryKey: ["viewer-tokens"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("viewer_tokens")
        .select("id, token, name, active, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ViewerToken[];
    },
  });

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Informe um nome para o link");
    const token = generateToken();
    const { error } = await supabase
      .from("viewer_tokens")
      .insert({ name: trimmed, token, active: true });
    if (error) return toast.error(error.message);
    toast.success("Link de visualização criado");
    setName("");
    qc.invalidateQueries({ queryKey: ["viewer-tokens"] });
  };

  const toggleActive = async (t: ViewerToken) => {
    const { error } = await supabase
      .from("viewer_tokens")
      .update({ active: !t.active })
      .eq("id", t.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["viewer-tokens"] });
  };

  const remove = async (t: ViewerToken) => {
    if (!confirm(`Excluir link "${t.name}"?`)) return;
    const { error } = await supabase.from("viewer_tokens").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Link removido");
    qc.invalidateQueries({ queryKey: ["viewer-tokens"] });
  };

  const copyLink = async (t: ViewerToken) => {
    const url = `${PUBLIC_VIEW_ORIGIN}/view/${t.token}`;
    await navigator.clipboard.writeText(url);
    toast.success("Link copiado");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Links de visualização (somente leitura)</CardTitle>
        <p className="text-xs text-muted-foreground">
          Gere um link compartilhável para visualizar o dashboard sem necessidade de e-mail ou cadastro.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[220px] space-y-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Nome do link</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Diretoria, Cliente X…"
              className="h-10"
            />
          </div>
          <Button onClick={create}>Gerar link</Button>
        </div>

        <div className="space-y-2">
          {(tokensQ.data ?? []).length === 0 && (
            <div className="text-sm text-muted-foreground">Nenhum link gerado.</div>
          )}
          {(tokensQ.data ?? []).map((t) => {
            const url = `${PUBLIC_VIEW_ORIGIN}/view/${t.token}`;
            const visible = showToken[t.id];
            return (
              <div key={t.id} className="flex flex-wrap items-center gap-2 rounded border bg-card px-3 py-2">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{t.name}</span>
                    {t.active ? (
                      <Badge variant="secondary">Ativo</Badge>
                    ) : (
                      <Badge variant="outline">Desativado</Badge>
                    )}
                  </div>
                  <div className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                    {visible ? url : url.replace(t.token, "•".repeat(12))}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowToken((s) => ({ ...s, [t.id]: !s[t.id] }))}>
                  {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="sm" onClick={() => copyLink(t)}>
                  <Copy className="mr-1 h-4 w-4" /> Copiar
                </Button>
                <Button variant="outline" size="sm" onClick={() => toggleActive(t)}>
                  {t.active ? "Desativar" : "Ativar"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => remove(t)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

async function fetchAll() {
  const [profiles, roles, ua] = await Promise.all([
    supabase.from("profiles").select("id, email, full_name").order("full_name"),
    supabase.from("user_roles").select("user_id, role"),
    supabase.from("user_areas").select("user_id, area_id"),
  ]);
  if (profiles.error) throw profiles.error;
  if (roles.error) throw roles.error;
  if (ua.error) throw ua.error;
  return {
    profiles: profiles.data as Profile[],
    roles: roles.data as RoleRow[],
    userAreas: ua.data as UserAreaRow[],
  };
}

function UsuariosPage() {
  const { isPcp } = useAuth();
  const qc = useQueryClient();
  const usersQ = useQuery({ queryKey: ["users-admin"], queryFn: fetchAll });
  const areasQ = useQuery({ queryKey: ["areas"], queryFn: fetchAreas });

  if (!isPcp) return <div>Acesso restrito ao PCP.</div>;

  const data = usersQ.data;
  const areas = areasQ.data ?? [];

  const setRole = async (userId: string, role: "pcp" | "lider", enabled: boolean) => {
    if (enabled) {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error && !error.message.includes("duplicate")) {
        toast.error(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    toast.success("Permissão atualizada");
    qc.invalidateQueries({ queryKey: ["users-admin"] });
  };

  const toggleArea = async (userId: string, areaId: string, enabled: boolean) => {
    if (enabled) {
      const { error } = await supabase.from("user_areas").insert({ user_id: userId, area_id: areaId });
      if (error && !error.message.includes("duplicate")) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_areas").delete().eq("user_id", userId).eq("area_id", areaId);
      if (error) return toast.error(error.message);
    }
    toast.success("Áreas atualizadas");
    qc.invalidateQueries({ queryKey: ["users-admin"] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Usuários e Permissões</h1>
        <p className="text-sm text-muted-foreground">
          Atribua o papel (PCP ou Líder) e as áreas que cada líder pode acessar.
          Novos usuários se cadastram pela tela de login e aparecem aqui.
        </p>
      </div>

      <ViewerTokensSection />

      <div className="grid gap-4">
        {data?.profiles.map((p) => {
          const userRoles = data.roles.filter((r) => r.user_id === p.id).map((r) => r.role);
          const userAreasIds = data.userAreas.filter((u) => u.user_id === p.id).map((u) => u.area_id);
          const isPcpRole = userRoles.includes("pcp");
          const isLiderRole = userRoles.includes("lider");
          return (
            <Card key={p.id}>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{p.full_name || p.email}</CardTitle>
                  <p className="text-xs text-muted-foreground">{p.email}</p>
                </div>
                <div className="flex gap-1">
                  {isPcpRole && <Badge>PCP</Badge>}
                  {isLiderRole && <Badge variant="secondary">Líder</Badge>}
                  {!isPcpRole && !isLiderRole && <Badge variant="outline">Sem papel</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant={isPcpRole ? "default" : "outline"}
                    size="sm"
                    onClick={() => setRole(p.id, "pcp", !isPcpRole)}
                  >
                    {isPcpRole ? "Remover PCP" : "Tornar PCP"}
                  </Button>
                  <Button
                    variant={isLiderRole ? "default" : "outline"}
                    size="sm"
                    onClick={() => setRole(p.id, "lider", !isLiderRole)}
                  >
                    {isLiderRole ? "Remover Líder" : "Tornar Líder"}
                  </Button>
                </div>
                {isLiderRole && (
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Áreas atribuídas
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {areas.map((a) => {
                        const checked = userAreasIds.includes(a.id);
                        return (
                          <label
                            key={a.id}
                            className="flex items-center gap-2 rounded border bg-card px-2 py-1.5 text-sm"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) => toggleArea(p.id, a.id, Boolean(v))}
                            />
                            {a.name}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}