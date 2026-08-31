import { headers } from "next/headers";
import Link from "next/link";
import { supabase } from "../lib/supabaseServer";
import LogoutButton from "./LogoutButton";
import Logo from "./Logo";
import NavLoadingHint from "./NavLoadingHint";

const TABS = [
  { href: "/", label: "Clasificación", icon: "🏆" },
  { href: "/en-directo", label: "En directo", icon: "🔴" },
  { href: "/calendario", label: "Calendario", icon: "📅" },
  { href: "/fichajes", label: "Fichajes", icon: "🤝" },
  { href: "/palmares", label: "Palmarés", icon: "🏅" },
  { href: "/equipo", label: "Equipo", icon: "👕" },
  { href: "/draft", label: "Draft", icon: "🎯" },
  { href: "/premios", label: "Premios", icon: "💰" },
];

export default async function NavBar() {
  const headerList = await headers();
  const teamId = headerList.get("x-team-id");
  if (!teamId) return null;

  const { data: equipo } = await supabase
    .from("teams")
    .select("id, name, crest_url")
    .eq("id", teamId)
    .maybeSingle();

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 pt-3">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
          <Logo className="h-7 w-7" />
          <span className="hidden sm:inline">FALM</span>
        </div>

        <div className="flex items-center gap-2">
          {equipo && (
            <Link
              href="/cuenta"
              title="Mi cuenta"
              className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted transition hover:border-neon-green hover:text-neon-green md:flex"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={equipo.crest_url} alt="" className="h-4 w-4 rounded-full object-cover" />
              <span>{equipo.name}</span>
              <NavLoadingHint />
            </Link>
          )}
          <Link
            href="/cuenta"
            title="Mi cuenta / cambiar PIN"
            className="rounded-full border border-border px-2.5 py-1.5 text-xs text-muted transition hover:border-neon-green hover:text-neon-green md:hidden"
          >
            🔑
            <NavLoadingHint />
          </Link>
          <Link
            href="/admin"
            title="Admin"
            className="rounded-full border border-border px-2.5 py-1.5 text-xs text-muted transition hover:border-neon-purple hover:text-neon-purple"
          >
            ⚙️
            <NavLoadingHint />
          </Link>
          <LogoutButton />
        </div>
      </div>

      <nav className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="shrink-0 whitespace-nowrap rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-white/5 hover:text-foreground sm:text-sm"
          >
            <span className="mr-1">{tab.icon}</span>
            <span>{tab.label}</span>
            <NavLoadingHint />
          </Link>
        ))}
      </nav>
    </header>
  );
}
