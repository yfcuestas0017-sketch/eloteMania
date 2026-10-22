// backend/src/controllers/report.controller.js
import { query } from "../config/db.js";

function validarRango(desde, hasta) {
  const formato = /^\d{4}-\d{2}-\d{2}$/;

  if (!formato.test(desde || "") || !formato.test(hasta || "")) {
    return false;
  }

  const inicio = new Date(`${desde}T00:00:00.000Z`);
  const fin = new Date(`${hasta}T00:00:00.000Z`);

  return (
    !Number.isNaN(inicio.getTime()) &&
    !Number.isNaN(fin.getTime()) &&
    inicio.toISOString().slice(0, 10) === desde &&
    fin.toISOString().slice(0, 10) === hasta &&
    desde <= hasta
  );
}

function obtenerRango(req, res) {
  const { desde, hasta } = req.query;

  if (!validarRango(desde, hasta)) {
    res.status(400).json({
      mensaje: "Debes indicar fechas válidas en formato AAAA-MM-DD."
    });
    return null;
  }

  return { desde, hasta };
}

export async function obtenerResumen(req, res) {
  const rango = obtenerRango(req, res);
  if (!rango) return;

  try {
    const esAdmin = req.user.roles?.includes("ADMIN");
    const cajeroParam = req.query.cajero_id ? Number(req.query.cajero_id) : null;
    const filtrarCajero = !esAdmin || cajeroParam !== null;
    const cajeroId = !esAdmin ? Number(req.user.usuario_id) : (cajeroParam || 0);

    const resultado = await query(
      `SELECT
         COUNT(*)::int AS cantidad_ventas,
         COALESCE(SUM(v.total), 0) AS total_recaudado,
         COALESCE(AVG(v.total), 0) AS promedio_venta
       FROM ventas v
       WHERE v.estado = 'vigente'
         AND (v.fecha_venta AT TIME ZONE 'America/Bogota')::date
             BETWEEN $1::date AND $2::date
         AND ($3::boolean = FALSE OR v.cajero_id = $4::bigint)`,
      [rango.desde, rango.hasta, filtrarCajero, cajeroId]
    );

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error("Error en obtenerResumen:", error);
    res.status(500).json({ mensaje: "No se pudo generar el resumen." });
  }
}

export async function obtenerVentasPorCajero(req, res) {
  const rango = obtenerRango(req, res);
  if (!rango) return;

  try {
    const resultado = await query(
      `SELECT
         u.usuario_id,
         u.nombres,
        COALESCE(u.nombres, 'Usuario eliminado') AS nombres,
         u.apellidos,
         COUNT(v.venta_id)::int AS cantidad_ventas,
         COALESCE(SUM(v.total), 0) AS total_recaudado
       FROM ventas v
       LEFT JOIN usuarios u ON u.usuario_id = v.cajero_id
       INNER JOIN usuarios u ON u.usuario_id = v.cajero_id
       WHERE v.estado = 'vigente'
         AND (v.fecha_venta AT TIME ZONE 'America/Bogota')::date
             BETWEEN $1::date AND $2::date
       GROUP BY u.usuario_id, u.nombres, u.apellidos
       ORDER BY total_recaudado DESC`,
      [rango.desde, rango.hasta]
    );

    res.json(resultado.rows);
  } catch (error) {
    console.error("Error en obtenerVentasPorCajero:", error);
    res.status(500).json({
      mensaje: "No se pudieron consultar las ventas por cajero."
    });
  }
}

export async function obtenerProductosMasVendidos(req, res) {
  const rango = obtenerRango(req, res);
  if (!rango) return;

  try {
    const limite = Math.min(Math.max(Number(req.query.limite) || 10, 1), 50);
    const esAdmin = req.user.roles?.includes("ADMIN");
    const cajeroParam = req.query.cajero_id ? Number(req.query.cajero_id) : null;
    const filtrarCajero = !esAdmin ? true : cajeroParam !== null;
    const cajeroId = !esAdmin ? Number(req.user.usuario_id) : (cajeroParam || 0);

    const resultado = await query(
      `SELECT
         dp.producto_id,
         dp.nombre_producto,
         COALESCE(c.nombre, 'Sin categoría') AS categoria,
         SUM(dp.cantidad)::numeric(12, 2) AS cantidad_vendida,
         SUM(dp.total_linea)::numeric(12, 2) AS total_recaudado
       FROM detalle_pedido dp
       JOIN pedidos p ON p.pedido_id = dp.pedido_id
       JOIN ventas v ON v.pedido_id = p.pedido_id
       LEFT JOIN productos pr ON pr.producto_id = dp.producto_id
       LEFT JOIN categorias c ON c.categoria_id = pr.categoria_id
       WHERE v.estado = 'vigente'
         AND (v.fecha_venta AT TIME ZONE 'America/Bogota')::date
             BETWEEN $1::date AND $2::date
         AND ($4::boolean = FALSE OR v.cajero_id = $5::bigint)
       GROUP BY dp.producto_id, dp.nombre_producto, c.nombre
       ORDER BY cantidad_vendida DESC, total_recaudado DESC
       LIMIT $3`,
      [rango.desde, rango.hasta, limite, filtrarCajero, cajeroId]
    );

    res.json(resultado.rows);
  } catch (error) {
    console.error("Error en obtenerProductosMasVendidos:", error);
    res.status(500).json({
      mensaje: "No se pudieron consultar los productos más vendidos."
    });
  }
}

export async function obtenerPedidosCajero(req, res) {
  const rango = obtenerRango(req, res);
  if (!rango) return;

  try {
    const roles = req.user.roles || [];
    const esAdmin = roles.includes("ADMIN");
    const cajeroParam = req.query.cajero_id ? Number(req.query.cajero_id) : null;

    // Si no es admin, SIEMPRE se restringe al usuario autenticado.
    // Si es admin, puede consultar un cajero específico o todos (si no envía cajero_id).
    const cajeroId = esAdmin && cajeroParam ? cajeroParam : (!esAdmin ? Number(req.user.usuario_id) : null);
    const filtrarCajero = cajeroId !== null;

    const resultado = await query(
      `SELECT
         v.venta_id,
         v.numero_venta,
         v.total,
         v.fecha_venta,
         p.pedido_id,
         p.numero_pedido,
         p.estado_entrega,
         c.comprobante_id,
         c.numero_comprobante,
         c.cantidad_impresiones,
         c.fecha_emision,
         COALESCE(mp.nombre, 'Efectivo') AS metodo_pago,
         COALESCE(TRIM(u.nombres || ' ' || COALESCE(u.apellidos, '')), 'Usuario eliminado') AS cajero,
         TRIM(u.nombres || ' ' || COALESCE(u.apellidos, '')) AS cajero,
         u.usuario_id AS cajero_id,
         COALESCE(
           (
             SELECT jsonb_agg(
               json_build_object(
                 'producto_id', dp.producto_id,
                 'tipo_item', 'producto',
                 'nombre', dp.nombre_producto,
                 'cantidad', dp.cantidad,
                 'precio_unitario', dp.precio_unitario,
                 'subtotal', dp.total_linea,
                 'observaciones', dp.observaciones
               ) ORDER BY dp.detalle_id
             )
             FROM detalle_pedido dp
             WHERE dp.pedido_id = p.pedido_id
           ),
           '[]'::jsonb
         ) ||
         COALESCE(
           (
             SELECT jsonb_agg(
               json_build_object(
                 'producto_id', NULL,
                 'adicional_id', pa.adicional_id,
                 'tipo_item', 'adicional',
                 'nombre', pa.nombre_adicional,
                 'cantidad', pa.cantidad,
                 'precio_unitario', pa.precio_unitario,
                 'subtotal', pa.total_linea,
                 'observaciones', NULL
               ) ORDER BY pa.pedido_adicional_id
             )
             FROM pedido_adicionales pa
             WHERE pa.pedido_id = p.pedido_id
           ),
           '[]'::jsonb
         ) AS productos
       FROM ventas v
       JOIN pedidos p ON p.pedido_id = v.pedido_id
       JOIN comprobantes c ON c.venta_id = v.venta_id
       LEFT JOIN usuarios u ON u.usuario_id = v.cajero_id
       JOIN usuarios u ON u.usuario_id = v.cajero_id
       LEFT JOIN pagos pa ON pa.pedido_id = p.pedido_id AND pa.estado = 'confirmado'
       LEFT JOIN metodos_pago mp ON mp.metodo_pago_id = pa.metodo_pago_id
       WHERE v.estado = 'vigente'
         AND ($3::boolean = FALSE OR v.cajero_id = $4::bigint)
         AND (v.fecha_venta AT TIME ZONE 'America/Bogota')::date
             BETWEEN $1::date AND $2::date
       ORDER BY v.fecha_venta DESC`,
      [rango.desde, rango.hasta, filtrarCajero, cajeroId || 0]
    );

    res.json(resultado.rows);
  } catch (error) {
    console.error("Error en obtenerPedidosCajero:", error);
    res.status(500).json({
      mensaje: "No se pudieron consultar los pedidos."
    });
  }
}
