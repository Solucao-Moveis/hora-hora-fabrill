import { createFileRoute, Outlet, useNavigate, Link, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Factory, LogOut, Target, ClipboardList, BarChart3, Users, AlertTriangle, Home } from "lucide-react";
import { cn } from "@/lib/utils";

// SMERP: hub central (para o botão "Voltar ao ERP")
const ERP_URL = "https://solucaomoveis-erp.h5xdag.easypanel.host/";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, loading, isPcp, isLider, isQualidade, signOut, areas } = useAuth();
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

  const navItems = isPcp
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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Factory className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold">Produção Hora a Hora</div>
              <div className="text-[11px] text-muted-foreground">
                {isPcp ? "PCP" : isQualidade ? "Qualidade" : `Líder · ${areas.map((a) => a.name).join(", ") || "—"}`}
              </div>
            </div>
          </div>
          <nav className="ml-4 hidden flex-1 items-center gap-1 md:flex">
            {navItems.map((it) => {
              const Icon = it.icon;
              const active = location.pathname === it.to || location.pathname.startsWith(it.to + "/");
              return (
                <Link
                  key={it.to}
                  to={it.to}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {it.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">{user.email}</span>
            <a href={ERP_URL} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">Voltar ao ERP</span>
            </a>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t bg-card px-2 py-1 md:hidden">
          {navItems.map((it) => {
            const Icon = it.icon;
            const active = location.pathname === it.to || location.pathname.startsWith(it.to + "/");
            return (
              <Link
                key={it.to}
                to={it.to}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
                  active ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {it.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}