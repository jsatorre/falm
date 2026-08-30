"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Logo from "../components/Logo";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [equipos, setEquipos] = useState([]);
  const [teamId, setTeamId] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    fetch("/api/auth/login")
      .then((r) => r.json())
      .then((data) => setEquipos(data.equipos ?? []));
  }, []);

  const equipo = equipos.find((e) => e.id === teamId);

  async function entrar(e) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se ha podido entrar");
        return;
      }
      router.push(searchParams.get("from") || "/");
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center gap-8 px-4 py-16">
      <div className="flex flex-col items-center text-center">
        <Logo className="h-16 w-16" />
        <p className="mt-3 text-sm font-medium uppercase tracking-[0.3em] text-neon-purple">FALM</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">¿Quién eres tú?</h1>
        <p className="mt-2 text-sm text-muted">
          Elige tu equipo y mete tu PIN para entrar a tu zona privada.
        </p>
      </div>

      <div className="grid w-full grid-cols-3 gap-2.5 sm:grid-cols-4">
        {equipos.map((e) => {
          const seleccionado = e.id === teamId;
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => {
                setTeamId(e.id);
                setError(null);
              }}
              className={`float-up flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-center transition ${
                seleccionado
                  ? "border-neon-purple bg-background-elevated glow-purple"
                  : "border-border bg-background-elevated/60 hover:border-white/20"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={e.crest_url}
                alt=""
                className="h-9 w-9 rounded-full object-cover"
                onError={(ev) => {
                  ev.currentTarget.style.display = "none";
                }}
              />
              <span className="line-clamp-2 text-[11px] font-medium leading-tight text-foreground">
                {e.name}
              </span>
            </button>
          );
        })}
      </div>

      {equipo && (
        <form
          onSubmit={entrar}
          className="float-up flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl border border-border bg-background-elevated p-5"
        >
          <p className="text-sm text-muted">
            Entrando como <span className="text-foreground">{equipo.name}</span>
          </p>
          <input
            autoFocus
            inputMode="numeric"
            maxLength={6}
            placeholder="PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-center text-xl tracking-[0.4em] outline-none focus:border-neon-purple"
          />
          {error && <p className="text-xs text-neon-pink">{error}</p>}
          <button
            type="submit"
            disabled={enviando || !pin}
            className="w-full rounded-xl bg-neon-purple px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-40"
          >
            {enviando ? "Entrando…" : "Entrar"}
          </button>
        </form>
      )}
    </main>
  );
}
