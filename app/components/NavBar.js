import { headers } from "next/headers";
import Link from "next/link";
import { supabase } from "../lib/supabaseServer";
import LogoutButton from "./LogoutButton";

const TABS = [
  { href: "/", label: "Clasificación", icon: "🏆" },
  { href: "/en-directo", label: "Jornada en directo", icon: "🔴" },
  { href: "/calendario", label: "Calendario", icon: "📅" },
  { href: "/fichajes", label: "Fichajes", icon: "🤝" },
  { href: "/palmares", label: "Palmarés", icon: "🏅" },
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
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
          <span className="text-lg">⚽</span>
          <span className="hidden sm:inline">FALM</span>
        </div>

        <nav className="flex items-center gap-1 rounded-full border border-border bg-background-elevated p-1">
          {TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="rounded-full px-3 py-1.5 text-xs font-medium text-muted transition hover:bg-white/5 hover:text-foreground sm:text-sm"
            >
              <span className="mr-1">{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {equipo && (
            <span className="hidden items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted md:flex">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={equipo.crest_url} alt="" className="h-4 w-4 rounded-full object-cover" />
              <span>{equipo.name}</span>
            </span>
          )}
          <Link
            href="/admin"
            title="Admin"
            className="rounded-full border border-border px-2.5 py-1.5 text-xs text-muted transition hover:border-neon-purple hover:text-neon-purple"
          >
            ⚙️
          </Link>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
