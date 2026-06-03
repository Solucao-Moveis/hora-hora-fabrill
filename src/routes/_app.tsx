import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Target, ClipboardList, BarChart3, Users, AlertTriangle, Home } from "lucide-react";
import { AppShell, type NavItem } from "@/components/AppShell";
import logo from "@/assets/logo-solucao-moveis.png";

// SMERP: hub central (para o botão "Voltar ao ERP")
const ERP_URL = "https://solucaomoveis-erp.h5xdag.easypanel.host/";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading, isPcp, isLider, isQualidade, areas } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        Carregando…
      </div>
    );
  }

  if (!isPcp && !isLider && !isQualidade) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-warning text-warning-foreground">
            <Users className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold">Aguardando atribuição</h1>
          <p className="text-sm text-muted-foreground">
            Sua conta foi criada, mas o PCP ainda não atribuiu seu papel.
            Entre em contato com o PCP para liberar seu acesso.
          </p>
          <Button asChild variant="outline">
            <a href={ERP_URL}><Home className="mr-2 h-4 w-4" /> Voltar ao ERP</a>
          </Button>
        </div>
      </div>
    );
  }

  const navItems: NavItem[] = isPcp
    ? [
        { to: "/pcp/metas", label: "Metas", icon: Target },
        { to: "/pcp/dashboard", label: "Dashboard", icon: BarChart3 },
        { to: "/pcp/relatorios", label: "Indicadores", icon: ClipboardList },
        { to: "/pcp/desvios", label: "Desvios", icon: AlertTriangle },
        { to: "/pcp/usuarios", label: "Usuários", icon: Users },
      ]
    : isQualidade
      ? [{ to: "/pcp/desvios", label: "Desvios de Produção", icon: AlertTriangle }]
      : [
          { to: "/lider", label: "Apontamento", icon: ClipboardList },
          { to: "/lider/dashboard", label: "Dashboard", icon: BarChart3 },
        ];

  const roleLabel = isPcp
    ? "PCP"
    : isQualidade
      ? "Qualidade"
      : `Líder · ${areas.map((a) => a.name).join(", ") || "—"}`;

  const pageTitle = navItems.find(
    (it) => location.pathname === it.to || location.pathname.startsWith(it.to + "/"),
  )?.label;

  return (
    <AppShell
      brand={{ logo, title: "Produção Hora a Hora", subtitle: roleLabel }}
      navItems={navItems}
      pathname={location.pathname}
      pageTitle={pageTitle}
      user={user}
      erpUrl={ERP_URL}
    >
      <Outlet />
    </AppShell>
  );
}
