"use client";

import { useEffect, useMemo, useState, useCallback } from "react";

const POLL_MS = 5000; // el draft es un evento en vivo e interactivo, más rápido que el resto de polling de la app

const POSICIONES = [
  { codigo: "PT", nombre: "Porteros" },
  { codigo: "DF", nombre: "Defensas" },
  { codigo: "MC", nombre: "Centrocampistas" },
  { codigo: "DL", nombre: "Delanteros" },
];

/**
 * Próximos `cantidad` turnos a partir de currentPick (0 = el turno actual),
 * saltándose los equipos retirados — mismo cálculo de orden serpiente +
 * salto de retirados que ya hace el servidor para decidir de quién es el
 * turno, solo que aquí se repite varios pasos hacia delante para poder
 * pintar la cola de quién viene después.
 */
function proximosTurnos(datos, cantidad) {
  const { teamOrder, currentPick, totalPicks, retirados } = datos;
  const retiradoSet = new Set(retirados ?? []);
  const n = teamOrder.length;
  if (n === 0) return [];

  const resultado = [];
  let pick = currentPick;
  while (resultado.length < cantidad && pick < totalPicks) {
    const ronda0 = Math.floor(pick / n);
    const posEnRonda = pick % n;
    const derecha = ronda0 % 2 === 0; // ronda "normal" recorre teamOrder hacia delante, la siguiente al revés
    const ordenRonda = derecha ? teamOrder : [...teamOrder].reverse();
    const teamId = ordenRonda[posEnRonda];
    if (!retiradoSet.has(teamId)) {
      resultado.push({ teamId, pasos: resultado.length, pickIndex: pick, derecha });
    }
    pick += 1;
  }
  return resultado;
}

export default function DraftBoard({ inicial, miTeamId, wishlistInicial }) {
  const [datos, setDatos] = useState(inicial);
  const [wishlist, setWishlist] = useState(new Set(wishlistInicial));
  const [posicion, setPosicion] = useState("TODOS");
  const [club, setClub] = useState("TODOS");
  const [busqueda, setBusqueda] = useState("");
  const [soloLibres, setSoloLibres] = useState(true);
  const [soloWishlist, setSoloWishlist] = useState(false);
  const [soloMiEquipo, setSoloMiEquipo] = useState(false);
  const [ficharEnCurso, setFicharEnCurso] = useState(null); // playerId en vuelo
  const [error, setError] = useState(null);
  const [pendienteFichar, setPendienteFichar] = useState(null); // jugador a confirmar, o null
  const [pendienteRetiro, setPendienteRetiro] = useState(false);
  const [ordenPor, setOrdenPor] = useState("nombre"); // alfabético por defecto, la API de Biwenger no trae ningún orden útil
  const [ordenAsc, setOrdenAsc] = useState(true);

  const refrescar = useCallback(async () => {
    const res = await fetch("/api/draft", { cache: "no-store" });
    if (res.ok) setDatos(await res.json());
  }, []);

  useEffect(() => {
    const id = setInterval(refrescar, POLL_MS);
    return () => clearInterval(id);
  }, [refrescar]);

  async function ficharConfirmado() {
    const jugador = pendienteFichar;
    setPendienteFichar(null);
    setFicharEnCurso(jugador.id);
    setError(null);
    try {
      const res = await fetch("/api/draft/fichar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: jugador.id }),
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

  const [retirando, setRetirando] = useState(false);

  async function retiroConfirmado() {
    setPendienteRetiro(false);
    setRetirando(true);
    try {
      const res = await fetch("/api/draft/retirar", { method: "POST" });
      if (res.ok) await refrescar();
    } finally {
      setRetirando(false);
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

  const misJugadores = useMemo(() => datos.pool.filter((j) => j.teamId === miTeamId), [datos.pool, miTeamId]);

  const filtrados = useMemo(() => {
    return datos.pool.filter((j) => {
      if (posicion !== "TODOS" && j.posicionCodigo !== posicion) return false;
      if (club !== "TODOS" && j.club !== club) return false;
      if (busqueda && !j.nombre.toLowerCase().includes(busqueda.toLowerCase())) return false;
      if (soloMiEquipo) return j.teamId === miTeamId;
      if (soloLibres && j.ocupado) return false;
      if (soloWishlist && !wishlist.has(j.id)) return false;
      return true;
    });
  }, [datos.pool, posicion, club, busqueda, soloLibres, soloWishlist, soloMiEquipo, wishlist, miTeamId]);

  function comparar(a, b) {
    let va;
    let vb;
    if (ordenPor === "estado") {
      va = a.ocupado ? a.teamName ?? "" : "";
      vb = b.ocupado ? b.teamName ?? "" : "";
    } else {
      va = a[ordenPor];
      vb = b[ordenPor];
    }
    const cmp = typeof va === "string" ? va.localeCompare(vb) : (va ?? -1) - (vb ?? -1);
    return ordenAsc ? cmp : -cmp;
  }

  function alternarOrden(key) {
    if (ordenPor === key) {
      setOrdenAsc((a) => !a);
    } else {
      setOrdenPor(key);
      setOrdenAsc(true);
    }
  }

  function alternarMiEquipo() {
    setSoloMiEquipo((v) => {
      const activar = !v;
      if (activar) {
        // Al entrar en "Mi equipo" se parte de cero: el resto de filtros se
        // quitan y los marca el usuario si le hace falta, en vez de heredar
        // lo que tuviera puesto antes (p.ej. un club concreto) y liarla.
        setPosicion("TODOS");
        setClub("TODOS");
        setBusqueda("");
        setSoloLibres(false);
        setSoloWishlist(false);
      }
      return activar;
    });
  }

  const grupos =
    posicion === "TODOS"
      ? POSICIONES.map((p) => ({
          ...p,
          jugadores: filtrados.filter((j) => j.posicionCodigo === p.codigo).sort(comparar),
        })).filter((g) => g.jugadores.length > 0)
      : [{ codigo: posicion, nombre: null, jugadores: [...filtrados].sort(comparar) }];

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
  const proximos = proximosTurnos(datos, 24);
  const miProximoPaso = proximos.find((p) => p.teamId === miTeamId)?.pasos ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <p className="text-xs font-medium uppercase tracking-[0.3em] text-neon-purple">Draft</p>
      <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Tablero en vivo</h1>

      {datos.terminado && (
        <p className="mt-4 rounded-xl border border-neon-green/40 bg-neon-green/10 px-4 py-3 text-sm text-neon-green">
          Draft terminado — {datos.totalPicks} jugadores fichados entre los {datos.equipos.length} equipos.
        </p>
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
          <ChipFiltro activo={soloMiEquipo} onClick={alternarMiEquipo}>
            👕 Mi equipo ({misJugadores.length})
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
            <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[6%]" />
                <col className="w-[34%]" />
                <col className="w-[20%]" />
                <col className="w-[24%]" />
                <col className="w-[16%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border bg-background-elevated text-left text-xs uppercase tracking-wider text-muted">
                  <th className="px-3 py-3 font-medium">★</th>
                  <CabeceraOrdenable label="Jugador" campo="nombre" ordenPor={ordenPor} ordenAsc={ordenAsc} onClick={alternarOrden} />
                  <CabeceraOrdenable label="Club" campo="club" ordenPor={ordenPor} ordenAsc={ordenAsc} onClick={alternarOrden} />
                  <CabeceraOrdenable label="Estado" campo="estado" ordenPor={ordenPor} ordenAsc={ordenAsc} onClick={alternarOrden} />
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
                    <td className="truncate px-3 py-2.5 font-medium text-foreground">
                      {j.nombre}
                      <span className="ml-1.5 text-xs text-muted">{j.posicionCodigo}</span>
                    </td>
                    <td className="truncate px-3 py-2.5 text-muted">{j.club}</td>
                    <td className="truncate px-3 py-2.5">
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
                          onClick={() => setPendienteFichar(j)}
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

      {pendienteFichar && (
        <ConfirmModal
          titulo="¿Fichar a este jugador?"
          onCancelar={() => setPendienteFichar(null)}
          onConfirmar={ficharConfirmado}
          textoConfirmar="Fichar"
          colorConfirmar="bg-neon-pink text-black"
        >
          <p className="text-lg font-bold text-foreground">{pendienteFichar.nombre}</p>
          <p className="text-sm text-muted">
            {pendienteFichar.posicionCodigo} · {pendienteFichar.club}
          </p>
        </ConfirmModal>
      )}

      {!datos.terminado && (
        <TurnoFlotante
          datos={datos}
          equipoDe={equipoDe}
          equipoTurno={equipoTurno}
          miProximoPaso={miProximoPaso}
          proximos={proximos}
          misJugadores={misJugadores}
          miTeamId={miTeamId}
          retirando={retirando}
          onRetirar={() => setPendienteRetiro(true)}
        />
      )}

      {pendienteRetiro && (
        <ConfirmModal
          titulo={datos.estoyRetirado ? "¿Volver a fichar?" : "¿Ya no quieres fichar más jugadores?"}
          onCancelar={() => setPendienteRetiro(false)}
          onConfirmar={retiroConfirmado}
          textoConfirmar={datos.estoyRetirado ? "Volver a fichar" : "Sí, no quiero más"}
          colorConfirmar="bg-neon-green text-black"
        >
          <p className="text-sm text-muted">
            {datos.estoyRetirado
              ? "Recuperarás turno en tu siguiente hueco de la ronda."
              : "Tus turnos futuros se saltarán solos hasta que le des a \"Volver a fichar\" — puedes deshacerlo cuando quieras."}
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}

/**
 * Widget flotante fijo en la esquina — para que sepas de un vistazo si te
 * toca (o cuánto falta) aunque estés con la tabla de jugadores, sin que el
 * bloque de turno ocupe pantalla todo el rato. Colapsado solo enseña lo
 * esencial; al tocarlo se despliega el resto (cola de turnos, tu
 * plantilla, botón de retirarte).
 */
function TurnoFlotante({ datos, equipoDe, equipoTurno, miProximoPaso, proximos, misJugadores, miTeamId, retirando, onRetirar }) {
  const [abierto, setAbierto] = useState(false);
  const miEquipo = equipoDe(miTeamId);

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {abierto && (
        <div className="w-[min(90vw,360px)] rounded-2xl border border-border bg-background-elevated p-4 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <span className="rounded-full bg-neon-pink/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-neon-pink">
              Pick {datos.currentPick + 1} / {datos.totalPicks} · Ronda {datos.ronda}
            </span>
            <button type="button" onClick={() => setAbierto(false)} className="text-muted hover:text-foreground">
              ✕
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-border px-2.5 py-1 text-[10px] text-muted">
              Tu plantilla: {misJugadores.length} / {datos.pickSize}
            </span>
            {equipoTurno && (
              <span className="flex items-center gap-1.5 text-xs">
                <span className="text-muted">Turno de</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={equipoTurno.crest_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                <span className="font-bold text-foreground">{equipoTurno.name}</span>
              </span>
            )}
          </div>

          {datos.estoyRetirado && (
            <p className="mt-3 rounded-lg border border-neon-orange/40 bg-neon-orange/10 px-3 py-2 text-xs text-neon-orange">
              Has renunciado a fichar más jugadores — tus turnos se saltan automáticamente.
            </p>
          )}

          {proximos.length > 0 && (
            <div className="mt-3 flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1 [scrollbar-width:thin]">
              {proximos.slice(0, 12).map((p) => {
                const equipo = equipoDe(p.teamId);
                const esAhora = p.pasos === 0;
                const esYo = p.teamId === miTeamId;
                return (
                  <div
                    key={p.pickIndex}
                    className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
                      esAhora
                        ? "border-neon-green/60 bg-neon-green/10"
                        : esYo
                          ? "border-neon-pink/60 bg-neon-pink/5"
                          : "border-transparent"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={equipo?.crest_url}
                      alt=""
                      className={`h-8 w-8 shrink-0 rounded-full border-2 object-cover ${
                        esAhora ? "animate-pulse border-neon-green" : esYo ? "border-neon-pink" : "border-border"
                      }`}
                    />
                    <span className={`flex-1 truncate text-xs ${esYo ? "font-bold text-neon-pink" : "text-foreground"}`}>
                      {equipo?.name}
                    </span>
                    <span
                      title={p.derecha ? "Esta ronda avanza en este sentido" : "Esta ronda va al revés (serpiente)"}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        esAhora ? "bg-neon-green text-black" : "bg-background text-muted"
                      }`}
                    >
                      {p.derecha ? "→" : "←"}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={onRetirar}
            disabled={retirando}
            className={`mt-3 w-full rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40 ${
              datos.estoyRetirado
                ? "border-neon-green text-neon-green hover:bg-neon-green/10"
                : "border-border text-muted hover:border-neon-pink hover:text-neon-pink"
            }`}
          >
            {datos.estoyRetirado ? "Volver a fichar" : "Ya no quiero más jugadores"}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className={`flex items-center gap-2 rounded-full border-2 py-2 pl-2 pr-4 shadow-xl transition ${
          datos.esMiTurno
            ? "animate-pulse border-neon-green bg-neon-green/10"
            : "border-border bg-background-elevated"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={miEquipo?.crest_url} alt="" className="h-8 w-8 rounded-full border border-border object-cover" />
        <span className={`text-xs font-bold ${datos.esMiTurno ? "text-neon-green" : "text-foreground"}`}>
          {datos.esMiTurno
            ? "¡TU TURNO!"
            : datos.estoyRetirado
              ? "Retirado"
              : miProximoPaso != null
                ? `Te toca en ${miProximoPaso}`
                : "Draft"}
        </span>
      </button>
    </div>
  );
}

function ConfirmModal({ titulo, children, onCancelar, onConfirmar, textoConfirmar, colorConfirmar }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onClick={onCancelar}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-background-elevated p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-semibold uppercase tracking-wider text-neon-purple">{titulo}</p>
        <div className="mt-2">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-muted transition hover:border-white/20 hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition hover:opacity-90 ${colorConfirmar}`}
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}

function CabeceraOrdenable({ label, campo, ordenPor, ordenAsc, onClick }) {
  return (
    <th
      onClick={() => onClick(campo)}
      className="cursor-pointer select-none px-3 py-3 font-medium transition hover:text-foreground"
    >
      {label}
      {ordenPor === campo && <span className="ml-1">{ordenAsc ? "▲" : "▼"}</span>}
    </th>
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
