import { getCaraACaraRounds } from "../../../lib/caraACaraRounds";
import { asegurarDeadlineFichajes, deadlinePasada } from "../../../lib/fichajesEngine";
import {
  getVentanaExtra,
  abrirVentanaExtra,
  cancelarVentanaExtra,
  fijarDeadlineExtra,
  deadlineExtraPasada,
} from "../../../lib/ventanaExtra";

async function rondaActiva() {
  const rounds = await getCaraACaraRounds();
  const ronda = rounds.find((r) => r.status === "pending") ?? null;
  return ronda ? asegurarDeadlineFichajes(ronda) : null;
}

function estadoDe(ronda, extra) {
  return {
    jornadaCaraACara: ronda?.jornadaCaraACara ?? null,
    // La ventana normal de la jornada tiene que haber cerrado antes de abrir
    // una Extra encima — si no, no hay nada que "extender".
    ventanaNormalCerrada: ronda ? deadlinePasada(ronda) : false,
    abierta: Boolean(extra) && !extra.asignaciones && !deadlineExtraPasada(extra),
    cerrada: Boolean(extra) && (Boolean(extra.asignaciones) || deadlineExtraPasada(extra)),
    deadline: extra?.deadline ?? null,
  };
}

function parsearDeadline(valor) {
  if (valor == null || valor === "") return { deadline: null };
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return { error: "La fecha no es válida" };
  if (fecha <= new Date()) return { error: "La hora tope tiene que ser en el futuro" };
  return { deadline: fecha.toISOString() };
}

export async function GET() {
  const ronda = await rondaActiva();
  const extra = ronda ? await getVentanaExtra(ronda) : null;
  return Response.json(estadoDe(ronda, extra));
}

export async function POST(request) {
  const { accion, deadline: deadlineBruto } = await request.json();

  const ronda = await rondaActiva();
  if (!ronda) {
    return Response.json({ error: "No queda ninguna jornada pendiente" }, { status: 409 });
  }
  const extra = await getVentanaExtra(ronda);

  if (accion === "abrir") {
    if (!deadlinePasada(ronda)) {
      return Response.json(
        { error: "La ventana normal de esta jornada sigue abierta — no hace falta una Extra todavía" },
        { status: 409 }
      );
    }
    if (extra && !extra.asignaciones && !deadlineExtraPasada(extra)) {
      return Response.json({ error: "Ya hay una Ventana Extra abierta" }, { status: 409 });
    }
    const { deadline, error } = parsearDeadline(deadlineBruto);
    if (error) return Response.json({ error }, { status: 400 });
    const nueva = await abrirVentanaExtra(ronda, deadline);
    return Response.json(estadoDe(ronda, { ...nueva, asignaciones: null }));
  }

  if (accion === "deadline") {
    if (!extra || extra.asignaciones || deadlineExtraPasada(extra)) {
      return Response.json({ error: "No hay ninguna Ventana Extra abierta" }, { status: 409 });
    }
    const { deadline, error } = parsearDeadline(deadlineBruto);
    if (error) return Response.json({ error }, { status: 400 });
    const nueva = await fijarDeadlineExtra(extra, deadline);
    return Response.json(estadoDe(ronda, { ...nueva, asignaciones: null }));
  }

  if (accion === "cancelar") {
    if (!extra || extra.asignaciones || deadlineExtraPasada(extra)) {
      return Response.json({ error: "No hay ninguna Ventana Extra abierta que cancelar" }, { status: 409 });
    }
    await cancelarVentanaExtra();
    return Response.json(estadoDe(ronda, null));
  }

  return Response.json({ error: "Acción desconocida" }, { status: 400 });
}
