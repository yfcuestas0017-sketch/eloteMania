
import { query } from "../config/db.js";

export async function obtenerComprobante(req, res) {
  const comprobanteId = Number(req.params.id);

  if (!Number.isInteger(comprobanteId) || comprobanteId <= 0) {
    return res.status(400).json({
      mensaje: "Identificador de comprobante no válido."
    });
  }

  try {
    const cabecera = await query(
      `SELECT
         c.comprobante_id,
         c.numero_comprobante,
         c.fecha_emision,
         p.pedido_id,
         p.numero_pedido,
         v.venta_id,
         v.total,
         v.cajero_id,
         u.nombres AS cajero,
      COALESCE(u.nombres, 'Usuario eliminado') AS cajero,
         mp.nombre AS metodo_pago
       FROM comprobantes c
       LEFT JOIN usuarios u ON u.usuario_id = v.cajero_id
       JOIN ventas v ON v.venta_id = c.venta_id
       JOIN pedidos p ON p.pedido_id = v.pedido_id
       JOIN usuarios u ON u.usuario_id = v.cajero_id
       JOIN pagos pa ON pa.pedido_id = p.pedido_id AND pa.estado = 'confirmado'
       JOIN metodos_pago mp ON mp.metodo_pago_id = pa.metodo_pago_id
       WHERE c.comprobante_id = $1`,
      [comprobanteId]
    );

    if (cabecera.rowCount === 0) {
      return res.status(404).json({
        mensaje: "No se encontró el comprobante."
      });
    }

    const comprobante = cabecera.rows[0];

    // El cajero solo puede consultar sus comprobantes.
    const roles = req.user.roles || [];
    const esAdmin = roles.includes("ADMIN");
    const esPropietario =
      Number(comprobante.cajero_id) === Number(req.user.usuario_id);

    if (!esAdmin && !esPropietario) {
      return res.status(403).json({
        mensaje: "No tienes permiso para consultar este comprobante."
      });
    }

    const detalles = await query(
      `WITH lineas AS (
         SELECT
           pd.producto_id,
           NULL::bigint AS adicional_id,
           pd.nombre_producto AS nombre,
           pd.cantidad,
           pd.precio_unitario - COALESCE(ad.precio_unitario, 0)
             AS precio_unitario,
           pd.total_linea - COALESCE(ad.total_linea, 0) AS subtotal,
           'producto'::text AS tipo_item,
           pd.observaciones,
           '[]'::json AS adicionales,
           0 AS orden,
           pd.detalle_id AS orden_id
         FROM detalle_pedido pd
         LEFT JOIN LATERAL (
           SELECT
             COALESCE(SUM(dpa.precio_unitario), 0) AS precio_unitario,
             COALESCE(SUM(dpa.total_linea), 0) AS total_linea
           FROM detalle_pedido_adicionales dpa
           WHERE dpa.detalle_id = pd.detalle_id
         ) ad ON TRUE
         WHERE pd.pedido_id = $1

         UNION ALL

         SELECT
           NULL::bigint,
           dpa.adicional_id,
           dpa.nombre_adicional,
           dpa.cantidad,
           dpa.precio_unitario,
           dpa.total_linea,
           'adicional'::text,
           NULL::text,
           '[]'::json,
           1,
           dpa.detalle_pedido_adicional_id
         FROM detalle_pedido_adicionales dpa
         JOIN detalle_pedido pd ON pd.detalle_id = dpa.detalle_id
         WHERE pd.pedido_id = $1

         UNION ALL

         SELECT
           NULL::bigint,
           pa.adicional_id,
           pa.nombre_adicional,
           pa.cantidad,
           pa.precio_unitario,
           pa.total_linea,
           'adicional'::text,
           NULL::text,
           '[]'::json,
           1,
           pa.pedido_adicional_id
         FROM pedido_adicionales pa
         WHERE pa.pedido_id = $1
       )
       SELECT
         producto_id,
         adicional_id,
         nombre,
         cantidad,
         precio_unitario,
         subtotal,
         tipo_item,
         observaciones,
         adicionales
       FROM lineas
       ORDER BY orden, orden_id`,
      [comprobante.pedido_id]
    );

    return res.json({
      ...comprobante,
      productos: detalles.rows
    });
  } catch (error) {
    console.error("Error consultando comprobante:", error);

    return res.status(500).json({
      mensaje: "No se pudo consultar el comprobante."
    });
  }
}

export async function registrarImpresion(req, res) {
  const comprobanteId = Number(req.params.id);

  if (!Number.isInteger(comprobanteId) || comprobanteId <= 0) {
    return res.status(400).json({
      mensaje: "Identificador de comprobante no válido."
    });
  }

  try {
    const comprobante = await query(
      `SELECT
         c.comprobante_id,
         v.cajero_id
       FROM comprobantes c
       JOIN ventas v ON v.venta_id = c.venta_id
       WHERE c.comprobante_id = $1`,
      [comprobanteId]
    );

    if (comprobante.rowCount === 0) {
      return res.status(404).json({
        mensaje: "No se encontró el comprobante."
      });
    }

    const roles = req.user.roles || [];
    const esAdmin = roles.includes("ADMIN");
    const esPropietario =
      Number(comprobante.rows[0].cajero_id) === Number(req.user.usuario_id);

    if (!esAdmin && !esPropietario) {
      return res.status(403).json({
        mensaje: "No tienes permiso para imprimir este comprobante."
      });
    }

    // La función SQL valida la venta, registra la impresión (original o
    // reimpresión) y actualiza el contador del comprobante.
    const registro = await query(
      `SELECT registrar_impresion($1, $2) AS cantidad_impresiones`,
      [comprobanteId, req.user.usuario_id]
    );

    return res.status(201).json({
      mensaje: "Impresión registrada.",
      comprobante_id: comprobanteId,
      cantidad_impresiones: registro.rows[0].cantidad_impresiones
    });
  } catch (error) {
    if (error.code === "P0001") {
      return res.status(409).json({ mensaje: error.message });
    }

    console.error("Error registrando impresión:", error);

    return res.status(500).json({
      mensaje: "No se pudo registrar la impresión."
    });
  }
}
