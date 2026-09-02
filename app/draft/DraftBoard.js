"use client";

import { useEffect, useMemo, useState, useCallback } from "react";

const POLL_MS = 5000; // el draft es un evento en vivo e interactivo, más rápido que el resto de polling de la app

const POSICIONES = [
  { codigo: "PT", nombre: "Porteros" },
  { codigo: "DF", nombre: "Defensas" },
  { codigo: "MC", nombre: "Centrocampistas" },
  { codigo: "DL", nombre: "Delanteros" },
];

// Solo para la columna "Club" de la lista en móvil, donde no cabe el
// nombre completo — en pantallas más anchas (sm:) se sigue viendo el
// nombre entero.
const CLUB_ABREVIADO = {
  "Alavés": "ALA",
  "Athletic": "ATH",
  "Atlético": "ATM",
  "Barcelona": "BAR",
  "Betis": "BET",
  "Celta": "CEL",
  "Deportivo": "DEP",
  "Elche": "ELC",
  "Espanyol": "ESP",
  "Getafe": "GET",
  "Levante": "LEV",
  "Málaga": "MAL",
  "Osasuna": "OSA",
  "Racing": "RAC",
  "Rayo Vallecano": "RAY",
  "Real Madrid": "RMA",
  "Real Sociedad": "RSO",
  "Sevilla": "SEV",
  "Valencia": "VAL",
  "Villarreal": "VIL",
};

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

/**
 * Picks agrupados por equipo, jugadores ordenados alfabéticamente dentro
 * de cada uno — para el resumen final que sirve de chuleta al asignar
 * manualmente cada jugador a su equipo en el propio Biwenger (no hay API
 * para eso, es un paso manual del admin).
 */
function picksPorEquipo(datos) {
  const porEquipo = new Map(); // teamId -> jugadores[]
  for (const p of datos.picks) {
    if (!porEquipo.has(p.teamId)) porEquipo.set(p.teamId, []);
    porEquipo.get(p.teamId).push({ nombre: p.playerName, club: p.playerClub });
  }
  for (const jugadores of porEquipo.values()) {
    jugadores.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }
  return datos.equipos
    .map((e) => ({ equipo: e, jugadores: porEquipo.get(e.id) ?? [] }))
    .sort((a, b) => b.jugadores.length - a.jugadores.length);
}

// Ataque -> portero, como en la chuleta de referencia (una tabla en la
// que cada columna es un club real y dentro se agrupan por posición) que
// se usaba antes en la Sheet para planear fichajes de un vistazo. Un
// puntito de color por línea del campo (no el texto entero, que a este
// tamaño y sobre negro resultaba demasiado brillante) para que la
// separación entre bloques se vea de un vistazo, no solo por el hueco.
const POSICION_ORDEN_CLUB = ["DL", "MC", "DF", "PT"];
const COLOR_POSICION_CLUB = {
  DL: "var(--neon-pink)",
  MC: "var(--neon-purple)",
  DF: "var(--neon-green)",
  PT: "var(--neon-orange)",
};

// A diferencia de antes, no se filtran los bloques de posición vacíos —
// todos los clubes llevan sus 4 bloques (DL/MC/DF/PT) aunque estén
// vacíos, para poder rellenarlos luego hasta una altura común y que las
// etiquetas de posición queden alineadas entre columnas.
function agruparPorClub(jugadores) {
  const porClub = new Map(); // club -> jugadores[]
  for (const j of jugadores) {
    if (!porClub.has(j.club)) porClub.set(j.club, []);
    porClub.get(j.club).push(j);
  }
  return [...porClub.entries()]
    .map(([club, lista]) => ({
      club,
      porPosicion: POSICION_ORDEN_CLUB.map((codigo) => ({
        codigo,
        jugadores: lista
          .filter((j) => j.posicionCodigo === codigo)
          .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      })),
    }))
    .sort((a, b) => a.club.localeCompare(b.club, "es"));
}

/**
 * Vista alternativa al listado: una columna por club real (como la
 * chuleta que se usaba en la Sheet, 10 clubes por fila), con los
 * jugadores agrupados por posición dentro de cada una y etiquetados por
 * color. Los ya fichados (por cualquiera) se ven tachados; los tuyos,
 * además, en verde y sin tachar (siguen "cogidos" pero por ti); los de tu
 * wishlist llevan estrella, pulsable aquí mismo para añadir/quitar. Los
 * libres se pueden fichar tocando el nombre, igual que en la lista (solo
 * si es tu turno).
 */
// Cuántas columnas hay de verdad en cada fila visible, según el mismo
// breakpoint que usa la rejilla (grid-cols-2/3/5/10 más abajo) — para
// alinear el relleno de cada bloque de posición solo contra los vecinos
// que realmente comparten fila, no contra los 20 clubes a la vez (en
// móvil, con 2 columnas, eso dejaba huecos enormes comparando contra un
// club lejano que no se ve al lado).
function useColumnasPorFila() {
  const [n, setN] = useState(2);
  useEffect(() => {
    function calcular() {
      if (window.innerWidth >= 1024) return 10;
      if (window.innerWidth >= 768) return 5;
      if (window.innerWidth >= 640) return 3;
      return 2;
    }
    function actualizar() {
      setN(calcular());
    }
    actualizar();
    window.addEventListener("resize", actualizar);
    return () => window.removeEventListener("resize", actualizar);
  }, []);
  return n;
}

function TablaPorClub({ jugadores, wishlist, miTeamId, datos, ficharEnCurso, onFichar, onAlternarWishlist }) {
  const columnas = useMemo(() => agruparPorClub(jugadores), [jugadores]);
  const columnasPorFila = useColumnasPorFila();

  // Cuántos jugadores tiene, como máximo, un club en cada posición DENTRO
  // DE SU MISMA FILA VISIBLE — para rellenar el resto de esa fila hasta
  // esa altura y que la línea "MC"/"DF"/"PT" empiece a la misma altura
  // entre los que se ven codo con codo.
  const maxPorPosicionPorFila = useMemo(() => {
    const filas = [];
    for (let i = 0; i < columnas.length; i += columnasPorFila) {
      const fila = columnas.slice(i, i + columnasPorFila);
      const max = {};
      for (const codigo of POSICION_ORDEN_CLUB) {
        max[codigo] = fila.reduce((m, c) => {
          const grupo = c.porPosicion.find((g) => g.codigo === codigo);
          return Math.max(m, grupo?.jugadores.length ?? 0);
        }, 0);
      }
      filas.push(max);
    }
    return filas;
  }, [columnas, columnasPorFila]);

  if (columnas.length === 0) {
    return <p className="text-sm text-muted">No hay ningún jugador que cumpla ese filtro.</p>;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border">
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10">
        {columnas.map(({ club, porPosicion }, indiceColumna) => {
        const maxPorPosicion = maxPorPosicionPorFila[Math.floor(indiceColumna / columnasPorFila)];
        return (
          <div key={club} className="min-w-0 bg-background">
            <p className="truncate border-b border-border bg-background-elevated px-1 py-2 text-center text-[10px] font-bold uppercase tracking-wide text-neon-purple">
              {club}
            </p>
            <div className="flex flex-col gap-2.5 px-1.5 py-2">
              {porPosicion.map((grupo) => (
                <div key={grupo.codigo} className="flex flex-col">
                  <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: COLOR_POSICION_CLUB[grupo.codigo] }}
                    />
                    {grupo.codigo}
                  </p>
                  {grupo.jugadores.map((j) => {
                    const esMio = j.ocupado && j.teamId === miTeamId;
                    const puedeFichar = !j.ocupado && !datos.terminado;
                    const enWishlist = wishlist.has(j.id);

                    return (
                      <div key={j.id} className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => onAlternarWishlist(j.id)}
                          title="Añadir/quitar de mi wishlist"
                          className={`shrink-0 text-[10px] leading-none ${enWishlist ? "text-amber-400" : "text-muted/40 hover:text-muted"}`}
                        >
                          {enWishlist ? "★" : "☆"}
                        </button>
                        {puedeFichar ? (
                          <button
                            type="button"
                            onClick={() => onFichar(j)}
                            disabled={!datos.esMiTurno || ficharEnCurso === j.id}
                            title={datos.esMiTurno ? "Fichar" : "Solo puede fichar quien tenga el turno"}
                            className="block min-w-0 flex-1 truncate rounded px-1 py-1 text-left text-[11px] leading-tight text-foreground transition hover:bg-white/10 disabled:hover:bg-transparent"
                          >
                            {ficharEnCurso === j.id ? "…" : j.nombre}
                          </button>
                        ) : (
                          <span
                            title={
                              j.ocupado
                                ? `${j.teamName} ${j.origen === "biwenger" ? "(Biwenger)" : "(draft)"}`
                                : j.posicionCodigo
                            }
                            className={`block min-w-0 flex-1 truncate rounded px-1 py-1 text-[11px] leading-tight ${
                              esMio
                                ? "font-bold text-neon-green"
                                : j.ocupado
                                  ? "text-muted/50 line-through"
                                  : "text-foreground"
                            }`}
                          >
                            {j.nombre}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {Array.from({ length: maxPorPosicion[grupo.codigo] - grupo.jugadores.length }).map((_, i) => (
                    <div key={`relleno-${i}`} className="invisible flex items-center gap-0.5">
                      <span className="text-[10px] leading-none">☆</span>
                      <span className="block min-w-0 flex-1 px-1 py-1 text-[11px] leading-tight">·</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
        })}
      </div>
    </div>
  );
}

function ResumenDraft({ datos }) {
  const [copiadoTeamId, setCopiadoTeamId] = useState(null);
  const grupos = useMemo(() => picksPorEquipo(datos), [datos]);

  async function copiar(teamId, jugadores) {
    const texto = jugadores.map((j) => j.nombre).join("\n");
    try {
      await navigator.clipboard.writeText(texto);
      setCopiadoTeamId(teamId);
      setTimeout(() => setCopiadoTeamId((actual) => (actual === teamId ? null : actual)), 1500);
    } catch {
      // clipboard no disponible (p.ej. http sin permisos) — sin drama, el
      // admin puede seleccionar y copiar el texto a mano.
    }
  }

  return (
    <div className="mt-6">
      <h2 className="text-sm font-bold uppercase tracking-wider text-neon-purple">
        Resumen — jugadores fichados por equipo
      </h2>
      <p className="mt-1 text-xs text-muted">
        Para asignarlos a mano en Biwenger. &quot;Copiar lista&quot; copia los nombres, uno por línea.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {grupos.map(({ equipo, jugadores }) => (
          <div key={equipo.id} className="rounded-2xl border border-border">
            <div className="flex items-center justify-between gap-2 border-b border-border bg-background-elevated px-3 py-2">
              <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={equipo.crest_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                {equipo.name}
                <span className="font-normal normal-case text-muted">({jugadores.length})</span>
              </span>
              <button
                type="button"
                onClick={() => copiar(equipo.id, jugadores)}
                disabled={jugadores.length === 0}
                className="shrink-0 rounded-lg border border-border px-2 py-1 text-[11px] text-muted hover:border-neon-green hover:text-neon-green disabled:opacity-40"
              >
                {copiadoTeamId === equipo.id ? "¡Copiado!" : "Copiar lista"}
              </button>
            </div>
            {jugadores.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted">Sin jugadores.</p>
            ) : (
              <ul className="divide-y divide-border/60 text-sm">
                {jugadores.map((j, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span>{j.nombre}</span>
                    <span className="shrink-0 text-xs text-muted">{j.club}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
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
  const [vista, setVista] = useState("lista"); // "lista" | "club"

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
        <>
          <p className="mt-4 rounded-xl border border-neon-green/40 bg-neon-green/10 px-4 py-3 text-sm text-neon-green">
            Draft terminado — {datos.totalPicks} jugadores fichados entre los {datos.equipos.length} equipos.
          </p>
          <ResumenDraft datos={datos} />
        </>
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

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <ChipFiltro activo={vista === "lista"} onClick={() => setVista("lista")}>
          📋 Lista
        </ChipFiltro>
        <ChipFiltro activo={vista === "club"} onClick={() => setVista("club")}>
          🏟️ Por club
        </ChipFiltro>

        <span className="mx-1 h-5 w-px bg-border" />

        <ChipFiltro activo={posicion === "TODOS"} onClick={() => setPosicion("TODOS")}>
          Todos
        </ChipFiltro>
        {POSICIONES.map((p) => (
          <ChipFiltro key={p.codigo} activo={posicion === p.codigo} onClick={() => setPosicion(p.codigo)}>
            {p.codigo}
          </ChipFiltro>
        ))}

        <select
          value={club}
          onChange={(e) => setClub(e.target.value)}
          className="w-28 shrink-0 rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-neon-green"
        >
          <option value="TODOS">Club</option>
          {clubes.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar jugador..."
          className="w-32 shrink-0 rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-neon-green"
        />

        <span className="mx-1 h-5 w-px bg-border" />

        <ChipFiltro activo={soloLibres} onClick={() => setSoloLibres((v) => !v)}>
          Solo libres
        </ChipFiltro>
        <ChipFiltro activo={soloWishlist} onClick={() => setSoloWishlist((v) => !v)}>
          ★ Wishlist
        </ChipFiltro>
        <ChipFiltro activo={soloMiEquipo} onClick={alternarMiEquipo}>
          👕 Mi equipo ({misJugadores.length})
        </ChipFiltro>
      </div>

      {vista === "club" && (
        <div className="mt-4">
          <TablaPorClub
            jugadores={filtrados}
            wishlist={wishlist}
            miTeamId={miTeamId}
            datos={datos}
            ficharEnCurso={ficharEnCurso}
            onFichar={setPendienteFichar}
            onAlternarWishlist={alternarWishlist}
          />
        </div>
      )}

      {vista === "lista" && (
      <div className="mt-4 flex flex-col gap-6">
        {grupos.map((grupo) => (
          <div key={grupo.codigo} className="overflow-hidden rounded-2xl border border-border">
            {grupo.nombre && (
              <p className="border-b border-border bg-background-elevated px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-neon-purple sm:px-3 sm:py-2">
                {grupo.nombre}
              </p>
            )}
            <table className="w-full table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-7 sm:w-[6%]" />
                <col />
                <col className="w-12 sm:w-[20%]" />
                <col className="w-6 sm:w-[24%]" />
                <col className="w-14 sm:w-[16%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border bg-background-elevated text-left text-xs uppercase tracking-wider text-muted">
                  <th className="px-1.5 py-2 font-medium sm:px-3 sm:py-3">★</th>
                  <CabeceraOrdenable label="Jugador" campo="nombre" ordenPor={ordenPor} ordenAsc={ordenAsc} onClick={alternarOrden} />
                  <CabeceraOrdenable label="Club" campo="club" ordenPor={ordenPor} ordenAsc={ordenAsc} onClick={alternarOrden} />
                  <CabeceraOrdenable label="Estado" campo="estado" ordenPor={ordenPor} ordenAsc={ordenAsc} onClick={alternarOrden} />
                  <th className="px-1.5 py-2 font-medium sm:px-3 sm:py-3"></th>
                </tr>
              </thead>
              <tbody>
                {grupo.jugadores.map((j) => (
                  <tr key={j.id} className="border-b border-border/60 last:border-0 hover:bg-white/[0.03]">
                    <td className="px-1.5 py-2 sm:px-3 sm:py-2.5">
                      <button
                        type="button"
                        onClick={() => alternarWishlist(j.id)}
                        className={`text-sm sm:text-base ${wishlist.has(j.id) ? "text-amber-400" : "text-muted/40 hover:text-muted"}`}
                        title="Añadir/quitar de mi wishlist"
                      >
                        {wishlist.has(j.id) ? "★" : "☆"}
                      </button>
                    </td>
                    <td className="truncate px-1.5 py-2 font-medium text-foreground sm:px-3 sm:py-2.5">
                      {j.nombre}
                      <span className="ml-1.5 text-xs text-muted">{j.posicionCodigo}</span>
                    </td>
                    <td className="truncate px-1 py-2 text-muted sm:px-3 sm:py-2.5">
                      <span className="sm:hidden">{CLUB_ABREVIADO[j.club] ?? j.club.slice(0, 3).toUpperCase()}</span>
                      <span className="hidden sm:inline">{j.club}</span>
                    </td>
                    <td className="px-1.5 py-2 sm:px-3 sm:py-2.5">
                      {j.ocupado ? (
                        <>
                          <span
                            title={`${j.teamName} ${j.origen === "biwenger" ? "(Biwenger)" : "(draft)"}`}
                            className="mx-auto block h-2 w-2 rounded-full bg-muted/50 sm:hidden"
                          />
                          <span className="hidden truncate text-xs text-muted sm:inline">
                            {j.teamName} {j.origen === "biwenger" ? "(Biwenger)" : "(draft)"}
                          </span>
                        </>
                      ) : (
                        <>
                          <span title="Libre" className="mx-auto block h-2 w-2 rounded-full bg-neon-green sm:hidden" />
                          <span className="hidden text-xs text-neon-green sm:inline">Libre</span>
                        </>
                      )}
                    </td>
                    <td className="px-1.5 py-2 text-right sm:px-3 sm:py-2.5">
                      {!j.ocupado && !datos.terminado && (
                        <button
                          type="button"
                          onClick={() => setPendienteFichar(j)}
                          disabled={!datos.esMiTurno || ficharEnCurso === j.id}
                          className="rounded-lg bg-neon-pink px-2 py-1 text-[11px] font-semibold text-black disabled:cursor-not-allowed disabled:opacity-30 sm:px-3 sm:py-1.5 sm:text-xs"
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
      )}

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
          proximoTeamId={proximos[1]?.teamId ?? null}
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
function TurnoFlotante({ datos, equipoDe, equipoTurno, miProximoPaso, proximoTeamId, misJugadores, miTeamId, retirando, onRetirar }) {
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

          {datos.teamOrder.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted">Orden del draft</p>
              <div className="flex flex-col gap-1">
                {datos.teamOrder.map((teamId) => {
                  const equipo = equipoDe(teamId);
                  const esAhora = teamId === datos.turnoDeTeamId;
                  const esSiguiente = !esAhora && teamId === proximoTeamId;
                  const esYo = teamId === miTeamId;
                  const retirado = (datos.retirados ?? []).includes(teamId);
                  return (
                    <div
                      key={teamId}
                      className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${
                        esAhora
                          ? "border-neon-green/60 bg-neon-green/10"
                          : esSiguiente
                            ? "border-neon-orange/60 bg-neon-orange/10"
                            : esYo
                              ? "border-neon-pink/60 bg-neon-pink/5"
                              : "border-transparent"
                      } ${retirado ? "opacity-40" : ""}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={equipo?.crest_url}
                        alt=""
                        className={`h-6 w-6 shrink-0 rounded-full border-2 object-cover ${
                          esAhora
                            ? "animate-pulse border-neon-green"
                            : esSiguiente
                              ? "border-neon-orange"
                              : esYo
                                ? "border-neon-pink"
                                : "border-border"
                        }`}
                      />
                      <span
                        className={`flex-1 truncate text-[11px] ${
                          retirado ? "line-through text-muted" : esYo ? "font-bold text-neon-pink" : "text-foreground"
                        }`}
                      >
                        {equipo?.name}
                      </span>
                      {esAhora && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-neon-green">Ahora</span>
                      )}
                      {esSiguiente && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-neon-orange">Siguiente</span>
                      )}
                    </div>
                  );
                })}
              </div>
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

function ChipFiltro({ activo, onClick, children, disabled, title, compacto }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`shrink-0 whitespace-nowrap rounded-full border font-semibold transition disabled:opacity-40 ${
        compacto ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
      } ${
        activo
          ? "border-neon-purple bg-neon-purple/10 text-neon-purple"
          : "border-border text-muted hover:border-white/20"
      }`}
    >
      {children}
    </button>
  );
}
