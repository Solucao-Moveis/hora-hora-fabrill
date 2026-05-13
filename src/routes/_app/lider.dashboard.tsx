import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/app/Dashboard";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/_app/lider/dashboard")({
  component: LiderDashboard,
});

function LiderDashboard() {
  const { areas } = useAuth();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard da Área</h1>
        <p className="text-sm text-muted-foreground">{areas.map((a) => a.name).join(" · ")}</p>
      </div>
      <Dashboard restrictAreaIds={areas.map((a) => a.id)} />
    </div>
  );
}