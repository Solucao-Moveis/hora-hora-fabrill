import { Link } from "@tanstack/react-router";
import { Home, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

// ============================================================
// AppShell — casca única do ERP Solução Móveis (SMERP).
// Sidebar esquerda recolhível (shadcn), mesmo cabeçalho/rodapé em todos os apps.
// Mantenha este arquivo IGUAL entre comprasolucao / hora-hora-fabrill / bip-solucao
// (Compras é a referência). Veja DESIGN-SYSTEM.md.
// ============================================================

export type NavItem = { to: string; label: string; icon: LucideIcon };

export type AppShellProps = {
  /** Marca exibida no topo da sidebar. */
  brand: { logo: string; title: string; subtitle?: string };
  /** Itens de navegação (mesma ordem em que aparecem na lateral). */
  navItems: NavItem[];
  /** Caminho atual da rota (cada app passa do seu router). */
  pathname: string;
  /** Matcher de item ativo. Padrão: igual ou prefixo de rota. */
  isActive?: (to: string, pathname: string) => boolean;
  /** Título mostrado no cabeçalho da página. */
  pageTitle?: string;
  /** Usuário logado (para exibir o e-mail no rodapé). */
  user?: { email?: string | null } | null;
  /** URL do hub ERP para o link "Voltar ao ERP". */
  erpUrl: string;
  /** Conteúdo extra à direita do cabeçalho (ex.: sino de notificações). */
  headerRight?: ReactNode;
  children: ReactNode;
};

const defaultIsActive = (to: string, pathname: string) =>
  pathname === to || pathname.startsWith(to + "/");

// Lê o estado salvo da sidebar para manter recolhida/expandida entre navegações.
function readSidebarDefaultOpen() {
  if (typeof document === "undefined") return true;
  const m = document.cookie.match(/(?:^|;\s*)sidebar_state=([^;]+)/);
  return m ? m[1] === "true" : true;
}

export function AppShell({
  brand,
  navItems,
  pathname,
  isActive = defaultIsActive,
  pageTitle,
  user,
  erpUrl,
  headerRight,
  children,
}: AppShellProps) {
  return (
    <SidebarProvider defaultOpen={readSidebarDefaultOpen()}>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-1 py-1">
            <img
              src={brand.logo}
              alt={brand.title}
              className="h-9 w-9 shrink-0 rounded-md bg-white object-contain"
            />
            <div className="grid flex-1 leading-tight group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-semibold">{brand.title}</span>
              {brand.subtitle && (
                <span className="truncate text-xs text-muted-foreground">{brand.subtitle}</span>
              )}
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map((item) => {
                  const active = isActive(item.to, pathname);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                        <Link to={item.to}>
                          <Icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          {user?.email && (
            <p className="truncate px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
              {user.email}
            </p>
          )}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Voltar ao ERP">
                <a href={erpUrl}>
                  <Home />
                  <span>Voltar ao ERP</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-4">
          <SidebarTrigger className="h-8 w-8" />
          <Separator orientation="vertical" className="mr-1 h-5" />
          <h1 className="truncate text-sm font-semibold">{pageTitle ?? brand.title}</h1>
          {headerRight && <div className="ml-auto flex items-center gap-1">{headerRight}</div>}
        </header>
        <main className="flex-1">
          <div className="mx-auto w-full max-w-7xl p-4 md:p-8">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
