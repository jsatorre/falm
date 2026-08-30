"use client";

import { useMemo, useState } from "react";

const POSICIONES = [
  { codigo: "PT", nombre: "Porteros" },
  { codigo: "DF", nombre: "Defensas" },
  { codigo: "MC", nombre: "Centrocampistas" },
  { codigo: "DL", nombre: "Delanteros" },
];

function columnas(nombreEquipo) {
  return [
    { key: "nombre", label: "Jugador", align: "left" },
    { key: "club", label: "Club", align: "left" },
    { key: "partidosJugados", label: "PJ club", align: "right" },
    { key: "minutosTotal", label: "Min. totales", align: "right" },
    { key: "minutosMedia", label: "Min. media", align: "right" },
    { key: "goles", label: "⚽", align: "right" },
    { key: "mvps", label: "⭐", align: "right" },
    { key: "jornadasEnEquipo", label: "Jornadas en el equipo", align: "right" },
    { key: "vecesTitularFalm", label: `Titular ${nombreEquipo}`, align: "right" },
    { key: "puntosTotales", label: "Pts", align: "right" },
    { key: "puntosAprovechados", label: "✅ Pts", align: "right" },
    { key: "puntosDesperdiciados", label: "❌ Pts", align: "right" },
  ];
}

export default function EquipoTable({ jugadores, nombreEquipo }) {
  const COLUMNAS = columnas(nombreEquipo);
  const [posicion, setPosicion] = useState("TODOS");
  const [club, setClub] = useState("TODOS");
  const [busqueda, setBusqueda] = useState("");
  const [ordenPor, setOrdenPor] = useState(null);
  const [ordenAsc, setOrdenAsc] = useState(true);

  const clubes = useMemo(
    () => [...new Set(jugadores.map((j) => j.club))].sort(),
    [jugadores]
  );

  const filtrados = useMemo(() => {
    return jugadores.filter((j) => {
      if (posicion !== "TODOS" && j.posicionCodigo !== posicion) return false;
      if (club !== "TODOS" && j.club !== club) return false;
      if (busqueda && !j.nombre.toLowerCase().includes(busqueda.toLowerCase())) return false;
      return true;
    });
  }, [jugadores, posicion, club, busqueda]);

  function comparar(a, b) {
    if (!ordenPor) return 0;
    const va = a[ordenPor];
    const vb = b[ordenPor];
    const cmp = typeof va === "string" ? va.localeCompare(vb) : (va ?? -1) - (vb ?? -1);
    return ordenAsc ? cmp : -cmp;
  }

  function alternarOrden(key) {
    if (ordenPor === key) {
      setOrdenAsc((a) => !a);
    } else {
      setOrdenPor(key);
      setOrdenAsc(false); // primer click: de mayor a menor, suele ser lo que interesa
    }
  }

  // Con posición "TODOS" se agrupa por puesto (orden PT/DF/MC/DL); con una
  // posición concreta seleccionada, ya es un único grupo, no hace falta
  // repetir la cabecera.
  const grupos =
    posicion === "TODOS"
      ? POSICIONES.map((p) => ({
          ...p,
          jugadores: filtrados.filter((j) => j.posicionCodigo === p.codigo).sort(comparar),
        })).filter((g) => g.jugadores.length > 0)
      : [{ codigo: posicion, nombre: null, jugadores: [...filtrados].sort(comparar) }];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1.5">
          <ChipPosicion activo={posicion === "TODOS"} onClick={() => setPosicion("TODOS")}>
            Todos
          </ChipPosicion>
          {POSICIONES.map((p) => (
            <ChipPosicion key={p.codigo} activo={posicion === p.codigo} onClick={() => setPosicion(p.codigo)}>
              {p.codigo}
            </ChipPosicion>
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
      </div>

      {filtrados.length === 0 ? (
        <p className="text-sm text-muted">No hay ningún jugador que cumpla ese filtro.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {grupos.map((grupo) => (
            <div key={grupo.codigo} className="overflow-x-auto rounded-2xl border border-border">
              {grupo.nombre && (
                <p className="border-b border-border bg-background-elevated px-3 py-2 text-xs font-bold uppercase tracking-wider text-neon-purple">
                  {grupo.nombre}
                </p>
              )}
              <table className="w-full min-w-[920px] table-fixed border-collapse text-sm">
                <colgroup>
                  <col className="w-[16%]" />
                  <col className="w-[11%]" />
                  <col className="w-[6%]" />
                  <col className="w-[8%]" />
                  <col className="w-[8%]" />
                  <col className="w-[5%]" />
                  <col className="w-[5%]" />
                  <col className="w-[10%]" />
                  <col className="w-[10%]" />
                  <col className="w-[6%]" />
                  <col className="w-[7.5%]" />
                  <col className="w-[7.5%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border bg-background-elevated text-left text-xs uppercase tracking-wider text-muted">
                    {COLUMNAS.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => alternarOrden(col.key)}
                        className={`cursor-pointer select-none px-3 py-3 font-medium transition hover:text-foreground ${
                          col.align === "right" ? "text-right" : "text-left"
                        }`}
                      >
                        {col.label}
                        {ordenPor === col.key && <span className="ml-1">{ordenAsc ? "▲" : "▼"}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grupo.jugadores.map((j) => (
                    <tr key={j.id} className="border-b border-border/60 last:border-0 hover:bg-white/[0.03]">
                      <td className="px-3 py-3">
                        <span className="flex min-w-0 items-center gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={j.foto}
                            alt=""
                            className="h-9 w-9 shrink-0 rounded-full border border-border bg-background-elevated object-cover"
                          />
                          <span className="flex min-w-0 flex-col">
                            <span className="flex items-center gap-1.5 font-medium text-foreground">
                              <span className="truncate">{j.nombre}</span>
                              <span
                                title={j.disponible ? "Disponible" : "Duda / lesión / sanción"}
                                className={`h-2 w-2 shrink-0 rounded-full ${j.disponible ? "bg-neon-green" : "bg-neon-pink"}`}
                              />
                            </span>
                            <span className="text-xs text-muted">{j.posicionCodigo}</span>
                          </span>
                        </span>
                      </td>
                      <td className="truncate px-3 py-3 text-muted">{j.club}</td>
                      <td className="px-3 py-3 text-right text-muted">{j.partidosJugados}</td>
                      <td className="px-3 py-3 text-right text-muted">{j.minutosTotal}</td>
                      <td className="px-3 py-3 text-right text-muted">{j.minutosMedia.toFixed(0)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-foreground">{j.goles}</td>
                      <td className="px-3 py-3 text-right font-semibold text-foreground">{j.mvps}</td>
                      <td className="px-3 py-3 text-right text-muted">{j.jornadasEnEquipo}</td>
                      <td className="px-3 py-3 text-right font-semibold text-neon-green">{j.vecesTitularFalm}</td>
                      <td className="px-3 py-3 text-right font-semibold text-foreground">{j.puntosTotales}</td>
                      <td className="px-3 py-3 text-right font-semibold text-neon-green">{j.puntosAprovechados}</td>
                      <td className="px-3 py-3 text-right font-semibold text-neon-pink">{j.puntosDesperdiciados}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChipPosicion({ activo, onClick, children }) {
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
