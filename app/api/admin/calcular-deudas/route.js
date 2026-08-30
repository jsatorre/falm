import { calcularYGuardarLiquidacion } from "../../../lib/dineroConfig";

// Calcula la liquidación ("quién debe a quién") a partir del estado actual
// y la deja publicada tal cual en la página de Premios — pensado para
// pulsarlo al final de la Liga, cuando todos los premios ya tienen
// ganador. Si se pulsa antes de tiempo, la liquidación queda "provisional"
// (solo cuadra el dinero ya ganado) hasta que se vuelva a calcular.
export async function POST() {
  try {
    const { liquidacion, calculadaAt } = await calcularYGuardarLiquidacion();
    return Response.json({
      ok: true,
      calculadaAt,
      transferencias: liquidacion.map((t) => ({ de: t.de.name, a: t.a.name, cantidad: t.cantidad })),
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
