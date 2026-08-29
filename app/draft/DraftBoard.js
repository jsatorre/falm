"use client";

import { useEffect, useMemo, useState, useCallback } from "react";

const POLL_MS = 5000; // el draft es un evento en vivo e interactivo, más rápido que el resto de polling de la app

const POSICIONES = [
  { codigo: "PT", nombre: "Porteros" },
  { codigo: "DF", nombre: "Defensas" },
  { codigo: "MC", nombre: "Centrocampistas" },
  { codigo: "DL", nombre: "Delanteros" },
];

export default function DraftBoard({ inicial, miTeamId, wishlistInicial }) {
  const [datos, setDatos] = useState(inicial);
  const [wishlist, setWishlist] = useState(new Set(wishlistInicial));
  const [posicion, setPosicion] = useState("TODOS");
  const [club, setClub] = useState("TODOS");
  const [busqueda, setBusqueda] = useState("");
  const [soloLibres, setSoloLibres] = useState(true);
  const [soloWishlist, setSoloWishlist] = useState(false);
  const [ficharEnCurso, setFicharEnCurso] = useState(null); // playerId en vuelo
  const [error, setError] = useState(null);

  const refrescar = useCallback(async () => {
    const res = await fetch("/api/draft", { cache: "no-store" });
    if (res.ok) setDatos(await res.json());
  }, []);

  useEffect(() => {
    const id = setInterval(refrescar, POLL_MS);
    return () => clearInterval(id);
  }, [refrescar]);

  async function fichar(playerId) {
    setFicharEnCurso(playerId);
    setError(null);
    try {
      const res = await fetch("/api/draft/fichar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se ha podido fichar");
        return;
      }
      await refrescar();
    } finally {
      setFicharEnCurso(null);
    }
  }

  async function alternarWishlist(playerId) {
    const yaEsta = wishlist.has(playerId);
    setWishlist((prev) => {
      const copia = new Set(prev);
      if (yaEsta) copia.delete(playerId);
      else copia.add(playerId);
      return copia;
    });
    if (yaEsta) {
      await fetch(`/api/draft/wishlist?playerId=${playerId}`, { method: "DELETE" });
    } else {
      await fetch("/api/draft/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
    }
  }

  const clubes = useMemo(() => [...new Set(datos.pool.map((j) => j.club))].sort(), [datos.pool]);

  const filtrados = useMemo(() => {
    return datos.pool.filter((j) => {
      if (posicion !== "TODOS" && j.posicionCodigo !== posicion) return false;
      if (club !== "TODOS" && j.club !== club) return false;
      if (busqueda && !j.nombre.toLowerCase().includes(busqueda.toLowerCase())) return false;
      if (soloLibres && j.ocupado) return false;
      if (soloWishlist && !wishlist.has(j.id)) return false;
      return true;
    });
  }, [datos.pool, posicion, club, busqueda, soloLibres, soloWishlist, wishlist]);

  const grupos =
    posicion === "TODOS"
      ? POSICIONES.map((p) => ({
          ...p,
          jugadores: filtrados.filter((j) => j.posicionCodigo === p.codigo),
        })).filter((g) => g.jugadores.length > 0)
      : [{ codigo: posicion, nombre: null, jugadores: filtrados }];

  if (!datos.configurado) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-16 text-center text-sm text-muted">
        El draft todavía no ha empezado — se avisará en el grupo cuando el admin lo arranque.
      </div>
    );
  }

  const equipoDe = (teamId) => datos.equipos.find((e) => e.id === teamId);
  const equipoTurno = datos.turnoDeTeamId ? equipoDe(datos.turnoDeTeamId) : null;
  const ultimosPicks = [...datos.picks].reverse().slice(0, 8);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <p className="text-xs font-medium uppercase tracking-[0.3em] text-neon-purple">Draft</p>
      <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Tablero en vivo</h1>

      {datos.terminado ? (
        <p className="mt-4 rounded-xl border border-neon-green/40 bg-neon-green/10 px-4 py-3 text-sm text-neon-green">
          Draft terminado — {datos.totalPicks} jugadores fichados entre los {datos.equipos.length} equipos.
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-background-elevated px-4 py-3">
          <span className="rounded-full bg-neon-pink/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-neon-pink">
            Pick {datos.currentPick + 1} / {datos.totalPicks} · Ronda {datos.ronda}
          </span>
          {equipoTurno && (
            <span className="flex items-center gap-2 text-sm">
              <span className="text-muted">Turno de</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={equipoTurno.crest_url} alt="" className="h-6 w-6 rounded-full object-cover" />
              <span className="font-bold text-foreground">{equipoTurno.name}</span>
            </span>
          )}
          {datos.esMiTurno && (
            <span className="animate-pulse rounded-full bg-neon-green px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-black">
              ¡Es tu turno!
            </span>
          )}
        </div>
      )}

      {ultimosPicks.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {ultimosPicks.map((p) => (
            <span
              key={p.pickIndex}
              className="shrink-0 whitespace-nowrap rounded-full border border-border px-2.5 py-1 text-[11px] text-muted"
            >
              #{p.pickIndex + 1} {p.teamName}: <span className="text-foreground">{p.playerName}</span>
            </span>
          ))}
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-neon-pink/40 bg-neon-pink/10 px-3 py-2 text-xs text-neon-pink">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1.5">
          <ChipFiltro activo={posicion === "TODOS"} onClick={() => setPosicion("TODOS")}>
            Todos
          </ChipFiltro>
          {POSICIONES.map((p) => (
            <ChipFiltro key={p.codigo} activo={posicion === p.codigo} onClick={() => setPosicion(p.codigo)}>
              {p.codigo}
            </ChipFiltro>
          ))}
        </div>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted">Club</span>
          <select
            value={club}
            onChange={(e) => setClub(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-neon-green"
          >
            <option value="TODOS">Todos</option>
            {clubes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted">Buscar jugador</span>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="nombre..."
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-neon-green"
          />
        </label>

        <div className="flex flex-wrap gap-1.5">
          <ChipFiltro activo={soloLibres} onClick={() => setSoloLibres((v) => !v)}>
            Solo libres
          </ChipFiltro>
          <ChipFiltro activo={soloWishlist} onClick={() => setSoloWishlist((v) => !v)}>
            ★ Mi wishlist
          </ChipFiltro>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-6">
        {grupos.map((grupo) => (
          <div key={grupo.codigo} className="overflow-x-auto rounded-2xl border border-border">
            {grupo.nombre && (
              <p className="border-b border-border bg-background-elevated px-3 py-2 text-xs font-bold uppercase tracking-wider text-neon-purple">
                {grupo.nombre}
              </p>
            )}
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-background-elevated text-left text-xs uppercase tracking-wider text-muted">
                  <th className="px-3 py-3 font-medium">★</th>
                  <th className="px-3 py-3 font-medium">Jugador</th>
                  <th className="px-3 py-3 font-medium">Club</th>
                  <th className="px-3 py-3 text-right font-medium">Pts</th>
                  <th className="px-3 py-3 font-medium">Estado</th>
                  <th className="px-3 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {grupo.jugadores.map((j) => (
                  <tr key={j.id} className="border-b border-border/60 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => alternarWishlist(j.id)}
                        className={`text-base ${wishlist.has(j.id) ? "text-amber-400" : "text-muted/40 hover:text-muted"}`}
                        title="Añadir/quitar de mi wishlist"
                      >
                        {wishlist.has(j.id) ? "★" : "☆"}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-foreground">
                      {j.nombre}
                      <span className="ml-1.5 text-xs text-muted">{j.posicionCodigo}</span>
                    </td>
                    <td className="px-3 py-2.5 text-muted">{j.club}</td>
                    <td className="px-3 py-2.5 text-right text-muted">{j.puntos}</td>
                    <td className="px-3 py-2.5">
                      {j.ocupado ? (
                        <span className="text-xs text-muted">
                          {j.teamName} {j.origen === "biwenger" ? "(Biwenger)" : "(draft)"}
                        </span>
                      ) : (
                        <span className="text-xs text-neon-green">Libre</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {!j.ocupado && !datos.terminado && (
                        <button
                          type="button"
                          onClick={() => fichar(j.id)}
                          disabled={!datos.esMiTurno || ficharEnCurso === j.id}
                          className="rounded-lg bg-neon-pink px-3 py-1.5 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-30"
                          title={datos.esMiTurno ? "Fichar" : "Solo puede fichar quien tenga el turno"}
                        >
                          {ficharEnCurso === j.id ? "…" : "Fichar"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {filtrados.length === 0 && (
          <p className="text-sm text-muted">No hay ningún jugador que cumpla ese filtro.</p>
        )}
      </div>

      <p className="mt-4 text-xs text-muted">
        Fichar aquí es solo un apunte interno del draft, no compra al jugador de verdad en
        Biwenger — cada uno tiene que ir luego al mercado de Biwenger y comprarlo él mismo.
      </p>
    </div>
  );
}

function ChipFiltro({ activo, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        activo
          ? "border-neon-purple bg-neon-purple/10 text-neon-purple"
          : "border-border text-muted hover:border-white/20"
      }`}
    >
      {children}
    </button>
  );
}
