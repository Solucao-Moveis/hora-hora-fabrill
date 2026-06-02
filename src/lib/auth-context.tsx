import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Role = "pcp" | "lider" | "qualidade" | "administrador";

export type AreaRef = { id: string; name: string; slug: string };

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  roles: Role[];
  areas: AreaRef[];
  isPcp: boolean;
  isLider: boolean;
  isQualidade: boolean;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

// SMERP SSO: se o ERP abriu este app com a sessão no hash (#smerp_sso&at=&rt=),
// adota essa sessão e limpa a URL — assim a pessoa entra sem logar de novo.
async function consumeSmerpSso() {
  if (typeof window === "undefined") return;
  const hash = window.location.hash;
  if (!hash || hash.indexOf("smerp_sso") === -1) return;
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const access_token = params.get("at");
  const refresh_token = params.get("rt");
  if (access_token && refresh_token) {
    try {
      await supabase.auth.setSession({ access_token, refresh_token });
    } catch (e) {
      console.error("[SMERP SSO]", e);
    }
  }
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState<Role[]>([]);
  const [areas, setAreas] = useState<AreaRef[]>([]);

  const loadProfileData = async (uid: string | undefined) => {
    if (!uid) {
      setRoles([]);
      setAreas([]);
      return;
    }
    const [{ data: rolesData }, { data: areasData }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", uid),
      supabase
        .from("user_areas")
        .select("area_id, areas:areas(id,name,slug)")
        .eq("user_id", uid),
    ]);
    setRoles(((rolesData ?? []) as { role: Role }[]).map((r) => r.role));
    setAreas(
      ((areasData ?? []) as Array<{ areas: AreaRef | null }>)
        .map((r) => r.areas)
        .filter((a): a is AreaRef => Boolean(a)),
    );
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      // defer to avoid deadlock
      setTimeout(() => {
        void loadProfileData(s?.user?.id);
      }, 0);
    });
    (async () => {
      await consumeSmerpSso();
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setUser(data.session?.user ?? null);
      void loadProfileData(data.session?.user?.id).finally(() => setLoading(false));
    })();
    return () => sub.subscription.unsubscribe();
  }, []);

  const refresh = async () => {
    await loadProfileData(user?.id);
  };
  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const isPcp = roles.includes("pcp");
  const isLider = roles.includes("lider");
  const isQualidade = roles.includes("qualidade");
  const isAdmin = roles.includes("administrador");

  return (
    <AuthContext.Provider
      value={{ session, user, loading, roles, areas, isPcp, isLider, isQualidade, isAdmin, refresh, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}