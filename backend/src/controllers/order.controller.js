import pool, { query } from "../config/db.js";

function obtenerIdUsuario(req) {
  return Number(req.user?.usuario_id);
}

function aCentavos(valor) {
  return Math.round(Number(valor) * 100);
}

function validarProductos(productos, adicionalesIndependientes) {
  if (!Array.isArray(productos) || !Array.isArray(adicionalesIndependientes)) {
    return "El detalle del pedido no es válido.";
  }

  if (productos.length === 0 && adicionalesIndependientes.length === 0) {
    return "Debes enviar al menos un producto o adicional.";
  }

  for (const producto of productos) {
    if (
      !Number.isInteger(Number(producto.producto_id)) ||
      Number(producto.producto_id) <= 0
    ) {
      return "Hay un identificador de producto no válido.";
    }

    if (
      !Number.isInteger(Number(producto.cantidad)) ||
      Number(producto.cantidad) <= 0
    ) {
      return "Todas las cantidades deben ser enteros positivos.";
    }

    if (
      producto.adicionales !== undefined &&
      (!Array.isArray(producto.adicionales) ||
        producto.adicionales.some(
          (id) =>
            !Number.isInteger(Number(id)) ||
            Number(id) <= 0
        ))
    ) {
      return "Hay adicionales seleccionados no válidos.";
    }
  }

  for (const adicional of adicionalesIndependientes) {
    if (
      !Number.isInteger(Number(adicional.adicional_id)) ||
      Number(adicional.adicional_id) <= 0 ||
      !Number.isInteger(Number(adicional.cantidad)) ||
      Number(adicional.cantidad) <= 0
    ) {
      return "Hay adicionales independientes no válidos.";
    }
  }

  return null;
}

// Las funciones SQL (confirmar_venta, entregar_pedido) lanzan RAISE EXCEPTION
// con mensajes pensados para el usuario; llegan como código P0001.
function esErrorDeNegocio(error) {
  return error?.code === "P0001";
}

export async function checkout(req, res) {
  const usuarioId = obtenerIdUsuario(req);
  const {
    metodo_pago_id,
    productos = [],
    adicionales: adicionalesIndependientes = []
  } = req.body;

  if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
    return res.status(401).json({
      mensaje: "No se pudo identificar al usuario de la sesión."
    });
  }

  const errorProductos = validarProductos(productos, adicionalesIndependientes);

  if (errorProductos) {
    return res.status(400).json({ mensaje: errorProductos });
  }

  if (
    !Number.isInteger(Number(metodo_pago_id)) ||
    Number(metodo_pago_id) <= 0
  ) {
    return res.status(400).json({
      mensaje: "Selecciona un método de pago válido."
    });
  }

  // Combina productos repetidos para evitar líneas duplicadas.
  const cantidades = new Map();

  for (const producto of productos) {
    const id = Number(producto.producto_id);
    cantidades.set(
      id,
      (cantidades.get(id) || 0) + Number(producto.cantidad)
    );
  }

  const ids = [... new Set(productos.map(p => Number(p.producto_id)))];
  const idsAdicionales = [
    ...new Set(
      productos
        .flatMap((producto) => (producto.adicionales || []).map(Number))
        .concat(adicionalesIndependientes.map((item) => Number(item.adicional_id)))
    )
  ];

  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");

    const metodo = await cliente.query(
      `SELECT metodo_pago_id
       FROM metodos_pago
       WHERE metodo_pago_id = $1 AND activo = TRUE`,
      [Number(metodo_pago_id)]
    );

    if (metodo.rowCount === 0) {
      await cliente.query("ROLLBACK");
      return res.status(400).json({
        mensaje: "El método de pago no existe o está inactivo."
      });
    }

    // Los precios SIEMPRE se leen de la base de datos, nunca del navegador.
    const productosBD = await cliente.query(
      `SELECT
         producto_id,
         codigo,
         nombre,
         precio,
         disponible,
         controla_inventario,
         stock_actual,
         eliminado_en
       FROM productos
       WHERE producto_id = ANY($1::bigint[])
       FOR UPDATE`,
      [ids]
    );

    if (productosBD.rowCount !== ids.length) {
      await cliente.query("ROLLBACK");
      return res.status(400).json({
        mensaje: "Uno o más productos no existen."
      });
    }

    for (const producto of productosBD.rows) {
      if (!producto.disponible || producto.eliminado_en) {
        await cliente.query("ROLLBACK");
        return res.status(400).json({
          mensaje: `El producto "${producto.nombre}" no está disponible.`
        });
      }

      const cantidadSolicitada =
        cantidades.get(Number(producto.producto_id)) || 0;
      if (
        producto.controla_inventario &&
        cantidadSolicitada > Number(producto.stock_actual)
      ) {
        await cliente.query("ROLLBACK");
        return res.status(409).json({
          mensaje: `Solo quedan ${Number(producto.stock_actual)} unidades de "${producto.nombre}".`
        });
      }
    }

    const adicionalesBD = idsAdicionales.length
      ? await cliente.query(
          `SELECT adicional_id, nombre, precio, activo
           FROM adicionales
           WHERE adicional_id = ANY($1::bigint[])
           FOR UPDATE`,
          [idsAdicionales]
        )
      : { rows: [], rowCount: 0 };
    if (idsAdicionales.length) {
      const asociaciones = await cliente.query(
        `SELECT adicional_id, producto_id
         FROM adicionales_productos
         WHERE adicional_id = ANY($1::bigint[])`,
        [idsAdicionales]
      );
      const productosPorAdicional = new Map();
      for (const asociacion of asociaciones.rows) {
        const ids =
          productosPorAdicional.get(Number(asociacion.adicional_id)) || [];
        ids.push(asociacion.producto_id);
        productosPorAdicional.set(
          Number(asociacion.adicional_id),
          ids
        );
      }
      for (const adicional of adicionalesBD.rows) {
        adicional.producto_ids =
          productosPorAdicional.get(Number(adicional.adicional_id)) || [];
      }
    }
    const adicionalesPorId = new Map(
      adicionalesBD.rows.map((adicional) => [
        Number(adicional.adicional_id),
        adicional
      ])
    );

    for (const item of productos) {
      for (const adicionalId of item.adicionales || []) {
        const adicional = adicionalesPorId.get(Number(adicionalId));
        if (
          !adicional ||
          !adicional.activo ||
          !adicional.producto_ids.some(
            (productoId) => Number(productoId) === Number(item.producto_id)
          )
        ) {
          await cliente.query("ROLLBACK");
          return res.status(409).json({
            mensaje: "Uno de los adicionales ya no está disponible para este producto."
          });
        }
      }
    }

    for (const item of adicionalesIndependientes) {
      const adicional = adicionalesPorId.get(Number(item.adicional_id));
      if (
        !adicional ||
        !adicional.activo ||
        adicional.producto_ids.length === 0
      ) {
        await cliente.query("ROLLBACK");
        return res.status(409).json({
          mensaje: "Uno de los adicionales ya no está disponible."
        });
      }
    }

    // 1) Crear el pedido en estado "pendiente".
    const pedidoCreado = await cliente.query(
      `INSERT INTO pedidos (numero_pedido, cajero_id)
       VALUES (
         'P-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDDHH24MISS')
              || '-' || SUBSTR(MD5(RANDOM()::TEXT), 1, 4),
         $1
       )
       RETURNING pedido_id, numero_pedido`,
      [usuarioId]
    );

    const pedido = pedidoCreado.rows[0];

        // 2) Guardar el detalle con los precios actuales del servidor.
    const porId = new Map(
      productosBD.rows.map((p) => [Number(p.producto_id), p])
    );

    let totalCentavos = 0;

    for (const item of productos) {
      const p = porId.get(Number(item.producto_id));
      const cantidad = Number(item.cantidad);
      const adicionales = [
        ...new Set((item.adicionales || []).map(Number))
      ].map((id) => adicionalesPorId.get(id));
      const precioUnitarioCentavos =
        aCentavos(p.precio) +
        adicionales.reduce(
          (suma, adicional) => suma + aCentavos(adicional.precio),
          0
        );
      const totalLineaCentavos = precioUnitarioCentavos * cantidad;
      const precioUnitario = (precioUnitarioCentavos / 100).toFixed(2);
      const totalLinea = (totalLineaCentavos / 100).toFixed(2);
      const observaciones =
        String(item.observaciones || "").trim().slice(0, 250) || null;

      totalCentavos += totalLineaCentavos;

      const detalle = await cliente.query(
        `INSERT INTO detalle_pedido (
           pedido_id, producto_id, nombre_producto, codigo_producto,
           cantidad, precio_unitario, total_linea, observaciones
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING detalle_id`,
        [
          pedido.pedido_id,
          p.producto_id,
          p.nombre,
          p.codigo,
          cantidad,
          precioUnitario,
          totalLinea,
          observaciones
        ]
      );

      for (const adicional of adicionales) {
        await cliente.query(
          `INSERT INTO detalle_pedido_adicionales (
             detalle_id, adicional_id, nombre_adicional,
             precio_unitario, cantidad, total_linea
           )
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            detalle.rows[0].detalle_id,
            adicional.adicional_id,
            adicional.nombre,
            adicional.precio,
            cantidad,
            (aCentavos(adicional.precio) * cantidad / 100).toFixed(2)
          ]
        );
      }
    }

    for (const item of adicionalesIndependientes) {
      const adicional = adicionalesPorId.get(Number(item.adicional_id));
      const cantidad = Number(item.cantidad);
      const precioUnitarioCentavos = aCentavos(adicional.precio);
      const totalLineaCentavos = precioUnitarioCentavos * cantidad;
      totalCentavos += totalLineaCentavos;

      await cliente.query(
        `INSERT INTO pedido_adicionales (
           pedido_id, adicional_id, nombre_adicional,
           precio_unitario, cantidad, total_linea
         )
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          pedido.pedido_id,
          adicional.adicional_id,
          adicional.nombre,
          (precioUnitarioCentavos / 100).toFixed(2),
          cantidad,
          (totalLineaCentavos / 100).toFixed(2)
        ]
      );
    }

  
    const venta = await cliente.query(
      `SELECT * FROM confirmar_venta($1, $2, $3, $4)`,
      [
        pedido.pedido_id,
        Number(metodo_pago_id),
        (totalCentavos / 100).toFixed(2),
        usuarioId
      ]
    );

    const resultado = venta.rows[0];

    // El pedido queda completado y entregado de inmediato: ya no hay paso de despacho.
    await cliente.query(
      `UPDATE pedidos
       SET estado_entrega = 'entregado'
       WHERE pedido_id = $1`,
      [pedido.pedido_id]
    );

    const comprobanteConsulta = await cliente.query(
      `SELECT comprobante_id, numero_comprobante, fecha_emision, venta_id
       FROM comprobantes
       WHERE comprobante_id = $1`,
      [resultado.resultado_comprobante_id]
    );

    if (comprobanteConsulta.rowCount === 0) {
      throw new Error("La venta se creó, pero no se encontró su comprobante.");
    }

    await cliente.query("COMMIT");

    return res.status(201).json({
      mensaje: "Venta confirmada correctamente.",
      pedido: {
        pedido_id: pedido.pedido_id,
        numero_pedido: pedido.numero_pedido
      },
      venta_id: resultado.resultado_venta_id,
      comprobante: {
        ...comprobanteConsulta.rows[0],
        total: resultado.resultado_total,
        numero_pedido: pedido.numero_pedido
      }
    });
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => {});

    if (esErrorDeNegocio(error)) {
      return res.status(409).json({ mensaje: error.message });
    }

    console.error("Error al confirmar pedido:", error);

    return res.status(500).json({
      mensaje: "No se pudo confirmar la venta."
    });
  } finally {
    cliente.release();
  }
}

export async function listarPendientesEntrega(req, res) {
  try {
    const resultado = await query(
      `SELECT
         p.pedido_id,
         p.numero_pedido,
         c.numero_comprobante,
         c.fecha_emision AS fecha_pedido,
         v.total,
         u.nombres AS cajero
        COALESCE(u.nombres, 'Usuario eliminado') AS cajero
       FROM pedidos p
       JOIN ventas v ON v.pedido_id = p.pedido_id
       JOIN comprobantes c ON c.venta_id = v.venta_id
       LEFT JOIN usuarios u ON u.usuario_id = v.cajero_id
       JOIN usuarios u ON u.usuario_id = v.cajero_id
       WHERE p.estado_entrega = 'pendiente'
         AND p.estado = 'completado'
         AND v.estado = 'vigente'
       ORDER BY c.fecha_emision ASC`
    );

    return res.json(resultado.rows);
  } catch (error) {
    console.error("Error consultando pedidos pendientes:", error);

    return res.status(500).json({
      mensaje: "No se pudieron consultar los pedidos pendientes."
    });
  }
}

export async function marcarPedidoEntregado(req, res) {
  const numeroComprobante = String(
    req.params.numeroComprobante || ""
  ).trim();

  if (!numeroComprobante) {
    return res.status(400).json({
      mensaje: "Debes indicar el número del comprobante."
    });
  }

  try {
    const resultado = await query(
      `SELECT entregar_pedido($1, $2) AS pedido_id`,
      [numeroComprobante, obtenerIdUsuario(req)]
    );

    return res.json({
      mensaje: "Pedido marcado como entregado.",
      pedido_id: resultado.rows[0].pedido_id
    });
  } catch (error) {
    if (esErrorDeNegocio(error)) {
      const noExiste = error.message.includes("no existe");
      return res.status(noExiste ? 404 : 409).json({
        mensaje: error.message
      });
    }

    console.error("Error registrando entrega:", error);

    return res.status(500).json({
      mensaje: "No se pudo registrar la entrega."
    });
  }
}
