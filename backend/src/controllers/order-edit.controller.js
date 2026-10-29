import pool from "../config/db.js";
import {
  aCentavos,
  esErrorDeNegocio,
  obtenerIdUsuario,
  validarProductos
} from "./order.controller.js";

/* ------------------------------------------------------------------ */
/* Utilidades compartidas                                              */
/* ------------------------------------------------------------------ */

const SQL_PEDIDO = `
  SELECT
    p.pedido_id,
    p.numero_pedido,
    p.numero_dia,
    p.estado,
    p.tipo_pedido,
    p.direccion_domicilio,
    p.barrio_domicilio,
    p.telefono_domicilio,
    p.nombre_cliente_domicilio,
    p.costo_domicilio,
    v.venta_id,
    v.cajero_id,
    v.estado AS estado_venta,
    v.total AS total_anterior,
    c.comprobante_id,
    c.numero_comprobante,
    c.fecha_emision,
    c.cantidad_impresiones,
    c.cantidad_ediciones,
    COALESCE(u.nombres, 'Usuario eliminado') AS cajero,
    (v.fecha_venta AT TIME ZONE 'America/Bogota')::date
      = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date AS es_de_hoy
  FROM pedidos p
  JOIN ventas v ON v.pedido_id = p.pedido_id
  JOIN comprobantes c ON c.venta_id = v.venta_id
  LEFT JOIN usuarios u ON u.usuario_id = v.cajero_id
  WHERE p.pedido_id = $1`;

function leerPedidoId(req) {
  const id = Number(req.params.pedidoId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function etiqueta(fila) {
  return fila.numero_dia ? `N° ${fila.numero_dia}` : fila.numero_pedido;
}

// Un cajero solo toca sus propios pedidos y solo del día de hoy (zona Bogotá).
// El administrador puede corregir cualquier pedido vigente.
function validarAcceso(req, fila) {
  if (fila.estado !== "completado" || fila.estado_venta !== "vigente") {
    return { status: 409, mensaje: "Este pedido ya fue anulado y no se puede modificar." };
  }

  const esAdmin = (req.user.roles || []).includes("ADMIN");
  if (esAdmin) return null;

  if (Number(fila.cajero_id) !== Number(req.user.usuario_id)) {
    return { status: 403, mensaje: "Solo puedes modificar los pedidos que cobraste tú." };
  }

  if (!fila.es_de_hoy) {
    return {
      status: 403,
      mensaje: "Solo puedes modificar pedidos de hoy. Pídele a un administrador que lo corrija."
    };
  }

  return null;
}

// Detalle actual del pedido. Los adicionales se devuelven como líneas
// independientes (los que venían pegados a un producto se agrupan aquí).
async function leerDetalleActual(db, pedidoId) {
  const productos = await db.query(
    `SELECT
       dp.detalle_id,
       dp.producto_id,
       dp.nombre_producto AS nombre,
       dp.cantidad,
       dp.precio_unitario - COALESCE(ad.precio, 0) AS precio_base,
       dp.observaciones,
       pr.imagen_url
     FROM detalle_pedido dp
     LEFT JOIN LATERAL (
       SELECT SUM(dpa.precio_unitario) AS precio
       FROM detalle_pedido_adicionales dpa
       WHERE dpa.detalle_id = dp.detalle_id
     ) ad ON TRUE
     LEFT JOIN productos pr ON pr.producto_id = dp.producto_id
     WHERE dp.pedido_id = $1
     ORDER BY dp.detalle_id`,
    [pedidoId]
  );

  const adicionales = await db.query(
    `SELECT
       adicional_id,
       nombre_adicional AS nombre,
       precio_unitario AS precio,
       SUM(cantidad)::int AS cantidad
     FROM (
       SELECT dpa.adicional_id, dpa.nombre_adicional, dpa.precio_unitario, dpa.cantidad
       FROM detalle_pedido_adicionales dpa
       JOIN detalle_pedido dp ON dp.detalle_id = dpa.detalle_id
       WHERE dp.pedido_id = $1
       UNION ALL
       SELECT pa.adicional_id, pa.nombre_adicional, pa.precio_unitario, pa.cantidad
       FROM pedido_adicionales pa
       WHERE pa.pedido_id = $1
     ) t
     GROUP BY adicional_id, nombre_adicional, precio_unitario
     ORDER BY MIN(nombre_adicional)`,
    [pedidoId]
  );

  return { productos: productos.rows, adicionales: adicionales.rows };
}

function resumirLineas(lineas) {
  return lineas.map((l) => `${Number(l.cantidad)}x ${l.nombre}`).join(", ") || "sin ítems";
}

// Ajusta el inventario por diferencia: solo mueve lo que realmente cambió.
async function ajustarInventario(cliente, { productosBD, cantidadAntes, cantidadDespues, pedidoId, usuarioId, motivo }) {
  for (const producto of productosBD) {
    if (!producto.controla_inventario) continue;

    const id = Number(producto.producto_id);
    const diferencia = (cantidadDespues.get(id) || 0) - (cantidadAntes.get(id) || 0);
    if (diferencia === 0) continue;

    const stockAnterior = Number(producto.stock_actual);
    const stockNuevo = stockAnterior - diferencia;

    await cliente.query(
      `UPDATE productos SET stock_actual = $2 WHERE producto_id = $1`,
      [id, stockNuevo]
    );

    await cliente.query(
      `INSERT INTO movimientos_inventario (
         producto_id, usuario_id, pedido_id, tipo, cantidad,
         stock_anterior, stock_nuevo, motivo
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        usuarioId,
        pedidoId,
        diferencia > 0 ? "salida" : "devolucion",
        Math.abs(diferencia),
        stockAnterior,
        stockNuevo,
        motivo
      ]
    );
  }
}

async function bloquearProductos(cliente, ids) {
  if (ids.length === 0) return [];

  // ORDER BY evita bloqueos cruzados entre dos operaciones simultáneas.
  const resultado = await cliente.query(
    `SELECT
       producto_id, codigo, nombre, precio, disponible,
       controla_inventario, stock_actual, eliminado_en
     FROM productos
     WHERE producto_id = ANY($1::bigint[])
     ORDER BY producto_id
     FOR UPDATE`,
    [ids]
  );

  return resultado.rows;
}

/* ------------------------------------------------------------------ */
/* GET /orders/:pedidoId/edicion  → datos para precargar el POS         */
/* ------------------------------------------------------------------ */

export async function obtenerPedidoParaEdicion(req, res) {
  const pedidoId = leerPedidoId(req);

  if (!pedidoId) {
    return res.status(400).json({ mensaje: "Identificador de pedido no válido." });
  }

  try {
    const cabecera = await pool.query(SQL_PEDIDO, [pedidoId]);

    if (cabecera.rowCount === 0) {
      return res.status(404).json({ mensaje: "No se encontró el pedido." });
    }

    const fila = cabecera.rows[0];
    const denegado = validarAcceso(req, fila);

    if (denegado) {
      return res.status(denegado.status).json({ mensaje: denegado.mensaje });
    }

    const detalle = await leerDetalleActual(pool, pedidoId);

    // Si el catálogo borró un producto/adicional, la línea quedó sin id
    // y no se puede reenviar. Es un caso raro: se anula y se vuelve a crear.
    if (
      detalle.productos.some((l) => l.producto_id === null) ||
      detalle.adicionales.some((l) => l.adicional_id === null)
    ) {
      return res.status(409).json({
        mensaje:
          "Este pedido incluye un producto o adicional que ya no existe en el catálogo, " +
          "por eso no se puede editar. Elimínalo y créalo de nuevo."
      });
    }

    const pago = await pool.query(
      `SELECT metodo_pago_id
       FROM pagos
       WHERE pedido_id = $1 AND estado = 'confirmado'
       ORDER BY pago_id DESC
       LIMIT 1`,
      [pedidoId]
    );

    return res.json({
      pedido: {
        pedido_id: fila.pedido_id,
        numero_pedido: fila.numero_pedido,
        numero_dia: fila.numero_dia,
        numero_comprobante: fila.numero_comprobante,
        comprobante_id: fila.comprobante_id,
        fecha_emision: fila.fecha_emision,
        cantidad_impresiones: fila.cantidad_impresiones,
        cantidad_ediciones: fila.cantidad_ediciones,
        cajero: fila.cajero,
        tipo_pedido: fila.tipo_pedido,
        direccion_domicilio: fila.direccion_domicilio,
        barrio_domicilio: fila.barrio_domicilio,
        telefono_domicilio: fila.telefono_domicilio,
        nombre_cliente_domicilio: fila.nombre_cliente_domicilio,
        costo_domicilio: Number(fila.costo_domicilio || 0),
        total: Number(fila.total_anterior),
        metodo_pago_id: pago.rows[0] ? Number(pago.rows[0].metodo_pago_id) : null
      },
      productos: detalle.productos.map((l) => ({
        producto_id: Number(l.producto_id),
        nombre: l.nombre,
        cantidad: Number(l.cantidad),
        precio: Number(l.precio_base),
        observaciones: l.observaciones || "",
        imagen_url: l.imagen_url || null
      })),
      adicionales: detalle.adicionales.map((l) => ({
        adicional_id: Number(l.adicional_id),
        nombre: l.nombre,
        cantidad: Number(l.cantidad),
        precio: Number(l.precio)
      }))
    });
  } catch (error) {
    console.error("Error cargando pedido para edición:", error);
    return res.status(500).json({ mensaje: "No se pudo cargar el pedido." });
  }
}

/* ------------------------------------------------------------------ */
/* PUT /orders/:pedidoId  → guardar la edición (mismo número/comprobante) */
/* ------------------------------------------------------------------ */

export async function editarPedido(req, res) {
  const usuarioId = obtenerIdUsuario(req);
  const pedidoId = leerPedidoId(req);

  const {
    metodo_pago_id,
    productos = [],
    adicionales: adicionalesIndependientes = [],
    tipo_pedido = "local",
    direccion_domicilio,
    barrio_domicilio,
    telefono_domicilio,
    nombre_cliente_domicilio,
    costo_domicilio = 0
  } = req.body;

  if (!pedidoId) {
    return res.status(400).json({ mensaje: "Identificador de pedido no válido." });
  }

  const errorProductos = validarProductos(productos, adicionalesIndependientes);
  if (errorProductos) {
    return res.status(400).json({ mensaje: errorProductos });
  }

  if (productos.some((p) => Array.isArray(p.adicionales) && p.adicionales.length > 0)) {
    return res.status(400).json({
      mensaje: "En la edición los adicionales se envían como artículos independientes."
    });
  }

  if (!Number.isInteger(Number(metodo_pago_id)) || Number(metodo_pago_id) <= 0) {
    return res.status(400).json({ mensaje: "Selecciona un método de pago válido." });
  }

  const tipoPedido = String(tipo_pedido || "local").trim().toLowerCase();
  if (tipoPedido !== "local" && tipoPedido !== "domicilio") {
    return res.status(400).json({
      mensaje: "El tipo de pedido debe ser 'local' o 'domicilio'."
    });
  }

  const esDomicilio = tipoPedido === "domicilio";
  const direccion = String(direccion_domicilio || "").trim().slice(0, 250);
  const barrio = String(barrio_domicilio || "").trim().slice(0, 150);
  const telefono = String(telefono_domicilio || "").trim().slice(0, 30);
  const nombreCliente = String(nombre_cliente_domicilio || "").trim().slice(0, 150);
  const costoDomicilioCentavos = esDomicilio ? aCentavos(costo_domicilio || 0) : 0;

  if (esDomicilio) {
    if (!direccion) return res.status(400).json({ mensaje: "Debes indicar la dirección del domicilio." });
    if (!barrio) return res.status(400).json({ mensaje: "Debes indicar el barrio del domicilio." });
    if (!telefono) return res.status(400).json({ mensaje: "Debes indicar el teléfono de contacto." });
    if (!nombreCliente) return res.status(400).json({ mensaje: "Debes indicar a nombre de quién va el pedido." });
    if (!Number.isFinite(costoDomicilioCentavos) || costoDomicilioCentavos < 0) {
      return res.status(400).json({ mensaje: "El costo del domicilio no puede ser negativo." });
    }
  }

  // Cantidades nuevas por producto y adicional (líneas repetidas se suman).
  const cantidadDespues = new Map();
  for (const p of productos) {
    const id = Number(p.producto_id);
    cantidadDespues.set(id, (cantidadDespues.get(id) || 0) + Number(p.cantidad));
  }

  const adicionalesNuevos = new Map();
  for (const a of adicionalesIndependientes) {
    const id = Number(a.adicional_id);
    adicionalesNuevos.set(id, (adicionalesNuevos.get(id) || 0) + Number(a.cantidad));
  }

  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");

    // 1) Bloquear el pedido y la venta para que nadie más los toque a la vez.
    const cabecera = await cliente.query(`${SQL_PEDIDO} FOR UPDATE OF p, v`, [pedidoId]);

    if (cabecera.rowCount === 0) {
      await cliente.query("ROLLBACK");
      return res.status(404).json({ mensaje: "No se encontró el pedido." });
    }

    const fila = cabecera.rows[0];
    const denegado = validarAcceso(req, fila);

    if (denegado) {
      await cliente.query("ROLLBACK");
      return res.status(denegado.status).json({ mensaje: denegado.mensaje });
    }

    const metodo = await cliente.query(
      `SELECT metodo_pago_id, nombre
       FROM metodos_pago
       WHERE metodo_pago_id = $1 AND activo = TRUE`,
      [Number(metodo_pago_id)]
    );

    if (metodo.rowCount === 0) {
      await cliente.query("ROLLBACK");
      return res.status(400).json({ mensaje: "El método de pago no existe o está inactivo." });
    }

    // 2) Lo que tenía el pedido antes de la edición.
    const antes = await leerDetalleActual(cliente, pedidoId);

    const cantidadAntes = new Map();
    const precioOriginalProducto = new Map();
    for (const l of antes.productos) {
      const id = Number(l.producto_id);
      cantidadAntes.set(id, (cantidadAntes.get(id) || 0) + Number(l.cantidad));
      if (!precioOriginalProducto.has(id)) precioOriginalProducto.set(id, aCentavos(l.precio_base));
    }

    const precioOriginalAdicional = new Map();
    for (const l of antes.adicionales) {
      const id = Number(l.adicional_id);
      if (!precioOriginalAdicional.has(id)) precioOriginalAdicional.set(id, aCentavos(l.precio));
    }

    // 3) Productos: se bloquean los de antes y los de ahora (para devolver / descontar stock).
    const idsUnion = [...new Set([...cantidadAntes.keys(), ...cantidadDespues.keys()])];
    const productosBD = await bloquearProductos(cliente, idsUnion);
    const productoPorId = new Map(productosBD.map((p) => [Number(p.producto_id), p]));

    for (const [id, solicitado] of cantidadDespues) {
      const producto = productoPorId.get(id);

      if (!producto) {
        await cliente.query("ROLLBACK");
        return res.status(400).json({ mensaje: "Uno o más productos no existen." });
      }

      const original = cantidadAntes.get(id) || 0;

      // Si el producto ya estaba en el pedido, se permite conservarlo aunque
      // hoy esté desactivado; lo que no se permite es agregar más unidades.
      if ((!producto.disponible || producto.eliminado_en) && solicitado > original) {
        await cliente.query("ROLLBACK");
        return res.status(400).json({
          mensaje: `El producto "${producto.nombre}" no está disponible.`
        });
      }

      // El stock actual ya descuenta lo que este pedido consumió; se le suma.
      const disponibleParaPedido = Number(producto.stock_actual) + original;
      if (producto.controla_inventario && solicitado > disponibleParaPedido) {
        await cliente.query("ROLLBACK");
        return res.status(409).json({
          mensaje: `Solo hay ${disponibleParaPedido} unidades de "${producto.nombre}" para este pedido.`
        });
      }
    }

    // 4) Adicionales nuevos: los que ya estaban se conservan; los nuevos se validan.
    const idsAdicionales = [...adicionalesNuevos.keys()];
    const adicionalesBD = idsAdicionales.length
      ? await cliente.query(
          `SELECT adicional_id, nombre, precio, activo
           FROM adicionales
           WHERE adicional_id = ANY($1::bigint[])
           ORDER BY adicional_id
           FOR UPDATE`,
          [idsAdicionales]
        )
      : { rows: [] };
    const adicionalPorId = new Map(adicionalesBD.rows.map((a) => [Number(a.adicional_id), a]));

    const idsAdicionalesNuevos = idsAdicionales.filter((id) => !precioOriginalAdicional.has(id));
    const asociados = new Set();
    if (idsAdicionalesNuevos.length) {
      const asociaciones = await cliente.query(
        `SELECT DISTINCT adicional_id
         FROM adicionales_productos
         WHERE adicional_id = ANY($1::bigint[])`,
        [idsAdicionalesNuevos]
      );
      for (const a of asociaciones.rows) asociados.add(Number(a.adicional_id));
    }

    for (const id of idsAdicionales) {
      const adicional = adicionalPorId.get(id);
      const yaEstaba = precioOriginalAdicional.has(id);

      if (!adicional || (!yaEstaba && (!adicional.activo || !asociados.has(id)))) {
        await cliente.query("ROLLBACK");
        return res.status(409).json({
          mensaje: "Uno de los adicionales ya no está disponible."
        });
      }
    }

    // 5) Reemplazar el detalle. Precios: lo que ya estaba conserva su precio
    //    original; lo nuevo toma el precio vigente de la base de datos.
    await cliente.query(`DELETE FROM detalle_pedido WHERE pedido_id = $1`, [pedidoId]);
    await cliente.query(`DELETE FROM pedido_adicionales WHERE pedido_id = $1`, [pedidoId]);

    let totalLineasCentavos = 0;
    const lineasNuevas = [];

    for (const item of productos) {
      const id = Number(item.producto_id);
      const producto = productoPorId.get(id);
      const cantidad = Number(item.cantidad);
      const precioCentavos = precioOriginalProducto.has(id)
        ? precioOriginalProducto.get(id)
        : aCentavos(producto.precio);
      const totalLineaCentavos = precioCentavos * cantidad;
      const observaciones = String(item.observaciones || "").trim().slice(0, 250) || null;

      totalLineasCentavos += totalLineaCentavos;

      await cliente.query(
        `INSERT INTO detalle_pedido (
           pedido_id, producto_id, nombre_producto, codigo_producto,
           cantidad, precio_unitario, total_linea, observaciones
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          pedidoId,
          id,
          producto.nombre,
          producto.codigo,
          cantidad,
          (precioCentavos / 100).toFixed(2),
          (totalLineaCentavos / 100).toFixed(2),
          observaciones
        ]
      );

      lineasNuevas.push({
        producto_id: id,
        tipo_item: "producto",
        nombre: producto.nombre,
        cantidad,
        precio_unitario: precioCentavos / 100,
        subtotal: totalLineaCentavos / 100,
        observaciones: observaciones || ""
      });
    }

    for (const item of adicionalesIndependientes) {
      const id = Number(item.adicional_id);
      const adicional = adicionalPorId.get(id);
      const cantidad = Number(item.cantidad);
      const precioCentavos = precioOriginalAdicional.has(id)
        ? precioOriginalAdicional.get(id)
        : aCentavos(adicional.precio);
      const totalLineaCentavos = precioCentavos * cantidad;

      totalLineasCentavos += totalLineaCentavos;

      await cliente.query(
        `INSERT INTO pedido_adicionales (
           pedido_id, adicional_id, nombre_adicional,
           precio_unitario, cantidad, total_linea
         )
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          pedidoId,
          id,
          adicional.nombre,
          (precioCentavos / 100).toFixed(2),
          cantidad,
          (totalLineaCentavos / 100).toFixed(2)
        ]
      );

      lineasNuevas.push({
        producto_id: null,
        adicional_id: id,
        tipo_item: "adicional",
        nombre: adicional.nombre,
        cantidad,
        precio_unitario: precioCentavos / 100,
        subtotal: totalLineaCentavos / 100,
        observaciones: ""
      });
    }

    const totalCentavos = totalLineasCentavos + costoDomicilioCentavos;

    if (totalCentavos <= 0) {
      await cliente.query("ROLLBACK");
      return res.status(400).json({ mensaje: "El total del pedido debe ser mayor que cero." });
    }

    // 6) Inventario: solo se mueve la diferencia (devolución o salida).
    await ajustarInventario(cliente, {
      productosBD,
      cantidadAntes,
      cantidadDespues,
      pedidoId,
      usuarioId,
      motivo: `Modificación del pedido ${etiqueta(fila)}`
    });

    // 7) Actualizar pedido, venta, pago y comprobante. El número de pedido,
    //    el número del día y el número de comprobante NO cambian.
    const subtotal = (totalLineasCentavos / 100).toFixed(2);
    const total = (totalCentavos / 100).toFixed(2);

    await cliente.query(
      `UPDATE pedidos
       SET tipo_pedido = $2,
           direccion_domicilio = $3,
           barrio_domicilio = $4,
           telefono_domicilio = $5,
           nombre_cliente_domicilio = $6,
           costo_domicilio = $7,
           subtotal = $8,
           descuento = 0,
           impuesto = 0,
           total = $9
       WHERE pedido_id = $1`,
      [
        pedidoId,
        tipoPedido,
        esDomicilio ? direccion : null,
        esDomicilio ? barrio : null,
        esDomicilio ? telefono : null,
        esDomicilio ? nombreCliente : null,
        (costoDomicilioCentavos / 100).toFixed(2),
        subtotal,
        total
      ]
    );

    await cliente.query(
      `UPDATE ventas
       SET subtotal = $2, descuento = 0, impuesto = 0, total = $3
       WHERE venta_id = $1`,
      [fila.venta_id, subtotal, total]
    );

    const pago = await cliente.query(
      `UPDATE pagos
       SET metodo_pago_id = $2, valor = $3
       WHERE pedido_id = $1 AND estado = 'confirmado'`,
      [pedidoId, Number(metodo_pago_id), total]
    );

    if (pago.rowCount === 0) {
      throw new Error("El pedido no tiene un pago confirmado que actualizar.");
    }

    const comprobante = await cliente.query(
      `UPDATE comprobantes
       SET cantidad_ediciones = cantidad_ediciones + 1,
           ultima_edicion = CURRENT_TIMESTAMP
       WHERE comprobante_id = $1
       RETURNING cantidad_ediciones, ultima_edicion`,
      [fila.comprobante_id]
    );

    // 8) Auditoría: qué había antes y qué quedó.
    const lineasAntes = [
      ...antes.productos.map((l) => ({ nombre: l.nombre, cantidad: l.cantidad })),
      ...antes.adicionales.map((l) => ({ nombre: l.nombre, cantidad: l.cantidad }))
    ];

    await cliente.query(
      `INSERT INTO auditoria (usuario_id, accion, tabla_afectada, registro_id, descripcion)
       VALUES ($1, 'EDITAR_VENTA', 'pedidos', $2, $3)`,
      [
        usuarioId,
        pedidoId,
        `Pedido ${etiqueta(fila)} (${fila.numero_comprobante}) modificado. ` +
          `Total ${Number(fila.total_anterior).toFixed(2)} → ${total}. ` +
          `Antes: ${resumirLineas(lineasAntes)}. Ahora: ${resumirLineas(lineasNuevas)}.`
      ]
    );

    await cliente.query("COMMIT");

    return res.json({
      mensaje: "Pedido modificado correctamente.",
      pedido: {
        pedido_id: pedidoId,
        numero_pedido: fila.numero_pedido,
        numero_dia: fila.numero_dia,
        tipo_pedido: tipoPedido
      },
      comprobante: {
        comprobante_id: fila.comprobante_id,
        numero_comprobante: fila.numero_comprobante,
        fecha_emision: fila.fecha_emision,
        ultima_edicion: comprobante.rows[0].ultima_edicion,
        cantidad_ediciones: comprobante.rows[0].cantidad_ediciones,
        cantidad_impresiones: fila.cantidad_impresiones,
        numero_pedido: fila.numero_pedido,
        numero_dia: fila.numero_dia,
        total,
        subtotal,
        metodo_pago: metodo.rows[0].nombre,
        cajero: fila.cajero,
        tipo_pedido: tipoPedido,
        direccion_domicilio: esDomicilio ? direccion : null,
        barrio_domicilio: esDomicilio ? barrio : null,
        telefono_domicilio: esDomicilio ? telefono : null,
        nombre_cliente_domicilio: esDomicilio ? nombreCliente : null,
        costo_domicilio: (costoDomicilioCentavos / 100).toFixed(2),
        productos: lineasNuevas
      }
    });
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => {});

    if (esErrorDeNegocio(error)) {
      return res.status(409).json({ mensaje: error.message });
    }

    console.error("Error al modificar pedido:", error);
    return res.status(500).json({ mensaje: "No se pudo guardar la modificación del pedido." });
  } finally {
    cliente.release();
  }
}

/* ------------------------------------------------------------------ */
/* DELETE /orders/:pedidoId  → anular (eliminar de los reportes)        */
/* ------------------------------------------------------------------ */

export async function anularPedido(req, res) {
  const usuarioId = obtenerIdUsuario(req);
  const pedidoId = leerPedidoId(req);
  const motivo = String(req.body?.motivo || "").trim().slice(0, 250) || "Eliminado por el cajero";

  if (!pedidoId) {
    return res.status(400).json({ mensaje: "Identificador de pedido no válido." });
  }

  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");

    const cabecera = await cliente.query(`${SQL_PEDIDO} FOR UPDATE OF p, v`, [pedidoId]);

    if (cabecera.rowCount === 0) {
      await cliente.query("ROLLBACK");
      return res.status(404).json({ mensaje: "No se encontró el pedido." });
    }

    const fila = cabecera.rows[0];
    const denegado = validarAcceso(req, fila);

    if (denegado) {
      await cliente.query("ROLLBACK");
      return res.status(denegado.status).json({ mensaje: denegado.mensaje });
    }

    // Devolver al inventario todo lo que este pedido había descontado.
    const antes = await leerDetalleActual(cliente, pedidoId);
    const cantidadAntes = new Map();
    for (const l of antes.productos) {
      if (l.producto_id === null) continue;
      const id = Number(l.producto_id);
      cantidadAntes.set(id, (cantidadAntes.get(id) || 0) + Number(l.cantidad));
    }

    const productosBD = await bloquearProductos(cliente, [...cantidadAntes.keys()]);

    await ajustarInventario(cliente, {
      productosBD,
      cantidadAntes,
      cantidadDespues: new Map(),
      pedidoId,
      usuarioId,
      motivo: `Anulación del pedido ${etiqueta(fila)}`
    });

    await cliente.query(`UPDATE ventas SET estado = 'anulada' WHERE venta_id = $1`, [fila.venta_id]);

    await cliente.query(
      `UPDATE pagos SET estado = 'anulado'
       WHERE pedido_id = $1 AND estado = 'confirmado'`,
      [pedidoId]
    );

    await cliente.query(
      `UPDATE pedidos
       SET estado = 'cancelado',
           cancelado_en = CURRENT_TIMESTAMP,
           motivo_cancelacion = $2
       WHERE pedido_id = $1`,
      [pedidoId, motivo]
    );

    await cliente.query(
      `INSERT INTO auditoria (usuario_id, accion, tabla_afectada, registro_id, descripcion)
       VALUES ($1, 'ANULAR_VENTA', 'pedidos', $2, $3)`,
      [
        usuarioId,
        pedidoId,
        `Pedido ${etiqueta(fila)} (${fila.numero_comprobante}) anulado por ` +
          `${Number(fila.total_anterior).toFixed(2)}. Motivo: ${motivo}. ` +
          `Detalle: ${resumirLineas([...antes.productos, ...antes.adicionales])}.`
      ]
    );

    await cliente.query("COMMIT");

    return res.json({
      mensaje: `El pedido ${etiqueta(fila)} fue eliminado.`,
      pedido_id: pedidoId
    });
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => {});

    if (esErrorDeNegocio(error)) {
      return res.status(409).json({ mensaje: error.message });
    }

    console.error("Error al anular pedido:", error);
    return res.status(500).json({ mensaje: "No se pudo eliminar el pedido." });
  } finally {
    cliente.release();
  }
}
