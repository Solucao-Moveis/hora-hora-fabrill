import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const { loading, user, isPcp } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
    } else if (isPcp) {
      navigate({ to: "/pcp/metas" });
    } else {
      navigate({ to: "/lider" });
    }
  }, [loading, user, isPcp, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-muted-foreground">Carregando…</div>
    </div>
  );
}
