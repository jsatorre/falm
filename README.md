# Liga de Amigos — Biwenger

App que sustituye la Sheet + Apps Script de la liga de amigos: clasificación
con puntuación propia, jornada en directo y fichajes privados por equipo.
Mismo stack que `reposiciones-app` (Next.js 16, React 19, Tailwind 4,
Supabase), pero en cuentas Vercel/Supabase **personales**, separadas de las
de Trendsplant.

## Estado: Fase 1 (mock, sin backend real)

Todo lo que hay ahora corre con datos de mentira en `app/lib/mockData.js` —
no hay Supabase ni Biwenger conectados todavía. Sirve para validar el flujo
completo (login por PIN, clasificación, jornada en directo, fichajes
privados) y el estilo visual antes de depender de cuentas/credenciales.

```bash
npm run dev
```

PIN de prueba para entrar con cualquier equipo: **1234**.

## Pendiente para Fase 2 (bloqueos)

1. Cuenta Vercel personal (email distinto del de trabajo) — conectar este
   repo cuando exista.
2. Cuenta + proyecto Supabase personal — ejecutar `app/lib/schema.sql` ahí.
3. Credenciales de Biwenger (email + contraseña de la cuenta que está en la
   liga) para `BIWENGER_EMAIL`/`BIWENGER_PASSWORD`, y el ID numérico de la
   liga — con eso se implementa `app/lib/integrations/biwenger.js` (login +
   clasificación real de liga) y se sustituye el mock.

## Estructura

- `app/lib/scoring.js` — motor de puntos 3/2/1.5/1/0 y cálculo de
  clasificación (puerto de `calcularPuntos`/`actualizarClasificacion` del
  Apps Script original), más el generador de calendario round-robin.
- `app/lib/fichajes.js` — algoritmo de prioridades de fichajes (puerto de
  `asignarFichajesConPrioridades`).
- `app/lib/auth.js` + `proxy.js` — sesión por equipo (PIN), cookie firmada
  con HMAC (`SESSION_SECRET`), cada equipo solo ve su propio wishlist.
- `app/lib/schema.sql` — esquema para cuando exista el Supabase real.
