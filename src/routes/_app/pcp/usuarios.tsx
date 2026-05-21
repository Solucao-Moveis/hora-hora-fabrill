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