// Uso (desde /backend):
//   node src/scripts/cerrar-caja-pendiente.js            -> solo muestra las cajas abiertas de dias anteriores
//   node src/scripts/cerrar-caja-pendiente.js --aplicar  -> las cierra
// Opcional: --contado=150000 --dejado=50000 (si no se indican, se usa el efectivo esperado)
import pool from "../config/db.js";

const aplicar = process.argv.includes("--aplicar");
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];

const ESPERADO = `
  SELECT t.monto_apertura
    + COALESCE((SELECT SUM(pa.valor) FROM pagos pa
        JOIN ventas v ON v.pedido_id = pa.pedido_id AND v.estado = 'vigente'
        JOIN metodos_pago mp ON mp.metodo_pago_id = pa.metodo_pago_id
        WHERE v.cajero_id = t.cajero_id
          AND v.fecha_venta >= t.abierta_en
          AND (v.fecha_venta AT TIME ZONE 'America/Bogota')::date = t.fecha
          AND pa.estado = 'confirmado' AND mp.nombre ILIKE '%efectivo%'), 0)
    - COALESCE((SELECT SUM(e.valor) FROM caja_egresos e WHERE e.turno_id = t.turno_id), 0) AS esperado
  FROM cajas_turnos t WHERE t.turno_id = $1`;

const cliente = await pool.connect();
try {
  await cliente.query("BEGIN");
  const { rows } = await cliente.query(
    `SELECT turno_id, cajero_id, TO_CHAR(fecha,'YYYY-MM-DD') AS fecha, monto_apertura
     FROM cajas_turnos
     WHERE cerrada_en IS NULL
       AND fecha < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date
     ORDER BY fecha FOR UPDATE`
  );
  if (!rows.length) console.log("No hay cajas pendientes de dias anteriores.");

  for (const t of rows) {
    const esperado = Number((await cliente.query(ESPERADO, [t.turno_id])).rows[0].esperado);
    const contado = arg("contado") != null ? Number(arg("contado")) : esperado;
    const dejado = arg("dejado") != null ? Number(arg("dejado")) : contado;
    console.log(`Turno ${t.turno_id} | cajero ${t.cajero_id} | ${t.fecha} | esperado ${esperado} | contado ${contado} | dejado ${dejado}`);
    if (!aplicar) continue;
    await cliente.query(
      `UPDATE cajas_turnos
       SET efectivo_esperado_cierre = $2, efectivo_contado = $3, monto_dejado_caja = $4,
           diferencia_cierre = $5, observacion_cierre = $6, cerrada_en = CURRENT_TIMESTAMP
       WHERE turno_id = $1`,
      [t.turno_id, esperado.toFixed(2), contado.toFixed(2), dejado.toFixed(2),
       (contado - esperado).toFixed(2), "Cierre manual: se olvidó cerrar la caja ese día."]
    );
  }
  await cliente.query(aplicar ? "COMMIT" : "ROLLBACK");
  console.log(aplicar ? "Cajas cerradas. Ya se puede abrir la de hoy." : "Simulación. Usa --aplicar para cerrar.");
} catch (e) {
  await cliente.query("ROLLBACK").catch(() => {});
  console.error("Error:", e.message);
  process.exitCode = 1;
} finally {
  cliente.release();
  await pool.end();
}