"use client";

import { useEffect, useMemo, useState } from "react";

export default function FichajesForm() {
  const [datos, setDatos] = useState(null);
  const [player1, setPlayer1] = useState("");
  const [player2, setPlayer2] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    fetch("/api/fichajes")
      .then((r) => r.json())
      .then((data) => {
        setDatos(data);
        setPlayer1(data.player1 ?? "");
        setPlayer2(data.player2 ?? "");
      })
      .finally(() => setCargando(false));
  }, []);

  async function guardar(e) {
    e.preventDefault();
    setGuardando(true);
    setGuardado(false);
    try {
      await fetch("/api/fichajes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player1, player2 }),
      });
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2500);
    } finally {
      setGuardando(false);
    }
  }

  if (cargando || !datos) {
    return <p className="text-sm text-muted">Cargando…</p>;
  }

  if (datos.cerrado) {
    return (
      <p className="text-sm text-muted">
        No hay ventana de fichajes abierta ahora mismo (la temporada cara a
        cara ya ha terminado sus 22 jornadas).
      </p>
    );
  }

  if (datos.publicado) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-neon-green">
          Fichajes de la jornada ya cerrados
        </p>
        {datos.asignaciones.length === 0 ? (
          <p className="text-sm text-muted">Nadie ha fichado a nadie esta jornada.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {datos.asignaciones.map((a, i) => (
              <div
                key={i}
                className={`flex items-center justify-between rounded-xl border px-4 py-2.5 text-sm ${
                  a.esTuyo ? "border-neon-green bg-neon-green/10" : "border-border bg-background-elevated"
                }`}
              >
                <span className="flex items-center gap-2">
                  {a.team?.crest_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.team.crest_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                  )}
                  <span className="text-foreground">{a.team?.name ?? "?"}</span>
                </span>
                <span className="font-semibold text-foreground">{a.player}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={guardar} className="flex flex-col gap-4">
      {datos.deadline && <ContadorDeadline deadline={datos.deadline} />}

      {datos.libresError ? (
        <>
          <Campo label="1ª opción" placeholder="ej. Vinicius Jr." value={player1} onChange={setPlayer1} />
          <Campo
            label="2ª opción (por si te la quitan)"
            placeholder="ej. Lamine Yamal"
            value={player2}
            onChange={setPlayer2}
          />
          <p className="text-xs text-neon-pink">
            No se ha podido cargar la lista de jugadores libres ahora mismo — de momento escribe el
            nombre a mano.
          </p>
        </>
      ) : (
        <>
          <ComboboxJugador
            label="1ª opción"
            value={player1}
            onChange={setPlayer1}
            jugadores={datos.jugadoresLibres ?? []}
            excluirNombre={player2}
          />
          <ComboboxJugador
            label="2ª opción (por si te la quitan)"
            value={player2}
            onChange={setPlayer2}
            jugadores={datos.jugadoresLibres ?? []}
            excluirNombre={player1}
          />
        </>
      )}

      <button
        type="submit"
        disabled={guardando}
        className="mt-2 rounded-xl bg-neon-green px-4 py-2.5 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-40"
      >
        {guardando ? "Guardando…" : guardado ? "¡Guardado! ✅" : "Guardar wishlist"}
      </button>

      <p className="text-xs text-muted">
        Solo tú ves esto. Cuando se cierre la ventana de fichajes, el equipo
        peor clasificado que no fichó la semana pasada tiene prioridad para
        llevarse su 1ª opción libre.
      </p>
    </form>
  );
}

function ComboboxJugador({ label, value, onChange, jugadores, excluirNombre }) {
  const [busqueda, setBusqueda] = useState("");

  const jugadorSeleccionado = jugadores.find((j) => j.nombre === value);

  const resultados = useMemo(() => {
    if (!busqueda.trim()) return [];
    const q = busqueda.toLowerCase();
    return jugadores
      .filter((j) => j.nombre !== excluirNombre && j.nombre.toLowerCase().includes(q))
      .slice(0, 8);
  }, [busqueda, jugadores, excluirNombre]);

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted">{label}</span>

      {value ? (
        <div className="flex items-center justify-between rounded-xl border border-neon-green/40 bg-neon-green/10 px-4 py-2.5">
          <span className="text-foreground">
            {value}
            {jugadorSeleccionado && <span className="ml-1.5 text-xs text-muted">({jugadorSeleccionado.club})</span>}
          </span>
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-xs text-muted hover:text-neon-pink"
          >
            ✕ quitar
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="busca un jugador libre..."
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 outline-none focus:border-neon-green"
          />
          {resultados.length > 0 && (
            <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-border bg-background-elevated shadow-lg">
              {resultados.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => {
                    onChange(j.nombre);
                    setBusqueda("");
                  }}
                  className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-white/5"
                >
                  <span className="text-foreground">
                    {j.nombre} <span className="text-xs text-muted">{j.posicionCodigo}</span>
                  </span>
                  <span className="text-xs text-muted">{j.club}</span>
                </button>
              ))}
            </div>
          )}
          {busqueda.trim() && resultados.length === 0 && (
            <p className="mt-1 text-xs text-muted">Ningún jugador libre coincide.</p>
          )}
        </div>
      )}
    </div>
  );
}

function ContadorDeadline({ deadline }) {
  const fecha = new Date(deadline);
  const texto = fecha.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <p className="rounded-lg border border-neon-orange/40 bg-neon-orange/10 px-3 py-2 text-xs text-neon-orange">
      Cierra el {texto} — después de esa hora se publican los fichajes automáticamente.
    </p>
  );
}

function Campo({ label, placeholder, value, onChange }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-border bg-background px-4 py-2.5 outline-none focus:border-neon-green"
      />
    </label>
  );
}
