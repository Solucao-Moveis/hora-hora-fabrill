import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/app/Dashboard";

export const Route = createFileRoute("/_app/pcp/dashboard")({
  component: () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard de Produção</h1>
        <p className="text-sm text-muted-foreground">Visão geral em tempo real — todas as áreas</p>
      </div>
      <Dashboard />
    </div>
  ),
});