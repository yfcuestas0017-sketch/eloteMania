import pool, { query } from "../config/db.js";

const FECHA_HOY = "(CURRENT_TIMESTAMP AT TIME ZONE 'America/Bogota')::date";

function montoValido(valor, permitirCero = false) {
  if (valor == null || (typeof valor === "string" && !valor.trim())) return false;
  const monto = Number(valor);
  return Number.isFinite(monto) &&
    monto <= 9999999999.99 &&
    (permitirCero ? monto >= 0 : monto > 0);
}

function texto(valor, maximo) {
  return typeof valor === "string" ? valor.trim().slice(0, maximo) : "";
}

function fechaValida(fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || "")) return false;
  const parsed = new Date(`${fecha}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === fecha;
}

async function obtenerTotales(cajeroId, fecha = null, db = { query }) {
  const fechaSql = fecha ? "$2::date" : FECHA_HOY;
  const parametros = fecha ? [cajeroId, fecha] : [cajeroId];
  const ventas = await db.query(
    `SELECT
       (SELECT COALESCE(SUM(v.total), 0)
        FROM ventas v
        WHERE v.estado = 'vigente' AND v.cajero_id = $1
          AND (v.fecha_venta AT TIME ZONE 'America/Bogota')::date = ${fechaSql}) AS ingresos,
       (SELECT COALESCE(SUM(pa.valor), 0)
        FROM pagos pa
        JOIN ventas v ON v.pedido_id = pa.pedido_id AND v.estado = 'vigente'
        JOIN metodos_pago mp ON mp.metodo_pago_id = pa.metodo_pago_id
        WHERE pa.estado = 'confirmado' AND mp.nombre ILIKE '%efectivo%'
          AND v.cajero_id = $1
          AND (v.fecha_venta AT TIME ZONE 'America/Bogota')::date = ${fechaSql}) AS ingresos_efectivo`,
    parametros
  );
  const egresos = await db.query(
    `SELECT COALESCE(SUM(e.valor), 0) AS total
     FROM caja_egresos e
     JOIN cajas_turnos t ON t.turno_id = e.turno_id
     WHERE t.cajero_id = $1 AND t.fecha = ${fechaSql}`,
    parametros
  );
  const gastos = Number(egresos.rows[0].total);
  const ingresos = Number(ventas.rows[0].ingresos);
  const efectivo = Number(ventas.rows[0].ingresos_efectivo);

  return {
    ingresos,
    ingresos_efectivo: efectivo,
    egresos: gastos,
    ganancias: ingresos - gastos
  };
}

async function obtenerEfectivoEsperadoTurno(turnoId, db = { query }) {
  const resultado = await db.query(
    `SELECT
       t.monto_apertura
       + COALESCE((
         SELECT SUM(pa.valor)
         FROM pagos pa
         JOIN ventas v ON v.pedido_id = pa.pedido_id AND v.estado = 'vigente'
         JOIN metodos_pago mp ON mp.metodo_pago_id = pa.metodo_pago_id
         WHERE v.cajero_id = t.cajero_id
           AND v.fecha_venta >= t.abierta_en
           AND (v.fecha_venta AT TIME ZONE 'America/Bogota')::date = t.fecha
           AND pa.estado = 'confirmado'
           AND mp.nombre ILIKE '%efectivo%'
       ), 0)
       - COALESCE((
         SELECT SUM(e.valor)
         FROM caja_egresos e
         WHERE e.turno_id = t.turno_id
       ), 0) AS efectivo_esperado
     FROM cajas_turnos t
     WHERE t.turno_id = $1`,
    [turnoId]
  );
  return Number(resultado.rows[0].efectivo_esperado);
}

export async function obtenerResumenCaja(req, res, next) {
  try {
    const cajeroId = Number(req.user.usuario_id);
    const [turno, anterior] = await Promise.all([
      query(
        `SELECT turno_id, TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha, monto_apertura,
                efectivo_esperado_cierre,
                efectivo_contado, monto_dejado_caja, diferencia_cierre, observacion_cierre,
                abierta_en, cerrada_en
         FROM cajas_turnos
         WHERE cajero_id = $1 AND (fecha = ${FECHA_HOY} OR cerrada_en IS NULL)
         ORDER BY (cerrada_en IS NULL) DESC, fecha DESC, turno_id DESC
         LIMIT 1`,
        [cajeroId]
      ),
      query(
        `SELECT monto_apertura,
                COALESCE(monto_dejado_caja, efectivo_contado) AS efectivo_contado,
                fecha
         FROM cajas_turnos
         WHERE cajero_id = $1 AND fecha <= ${FECHA_HOY} AND cerrada_en IS NOT NULL
         ORDER BY fecha DESC, turno_id DESC LIMIT 1`,
        [cajeroId]
      )
    ]);
    const totales = await obtenerTotales(cajeroId);
    const actual = turno.rows[0] || null;
    const montoApertura = actual && !actual.cerrada_en
      ? Number(actual.monto_apertura)
      : (anterior.rows[0] ? Number(anterior.rows[0].efectivo_contado) : null);

    const egresos = actual
      ? await query(
          `SELECT egreso_id, descripcion, valor, creado_en
           FROM caja_egresos
           WHERE turno_id = $1
           ORDER BY creado_en DESC`,
          [actual.turno_id]
        )
      : { rows: [] };

    const fechaActual = await query(`SELECT TO_CHAR(${FECHA_HOY}, 'YYYY-MM-DD') AS fecha`);
    const efectivoEsperado = actual
      ? (actual.efectivo_esperado_cierre != null
          ? Number(actual.efectivo_esperado_cierre)
          : await obtenerEfectivoEsperadoTurno(actual.turno_id))
      : null;
    res.json({
      fecha: fechaActual.rows[0].fecha,
      turno: actual,
      turno_abierto: Boolean(actual && !actual.cerrada_en),
      apertura_sugerida: montoApertura,
      fecha_cierre_anterior: anterior.rows[0]?.fecha || null,
      ...totales,
      efectivo_esperado: efectivoEsperado,
      egresos_detalle: egresos.rows
    });
  } catch (error) {
    next(error);
  }
}

export async function abrirCaja(req, res, next) {
  const montoSolicitado = req.body?.monto_apertura;
  const observacion = texto(req.body?.observacion, 500);
  if (!montoValido(montoSolicitado, true)) {
    return res.status(400).json({ mensaje: "Indica un monto de apertura válido." });
  }

  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const cajeroId = Number(req.user.usuario_id);
    await cliente.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`caja-${cajeroId}`]);

    const abierta = await cliente.query(
      `SELECT turno_id, TO_CHAR(fecha, 'YYYY-MM-DD') AS fecha FROM cajas_turnos
       WHERE cajero_id = $1 AND cerrada_en IS NULL
       ORDER BY fecha DESC LIMIT 1 FOR UPDATE`,
      [cajeroId]
    );
    if (abierta.rowCount) {
      await cliente.query("ROLLBACK");
      return res.status(409).json({
        mensaje: `Debes cerrar primero la caja del ${abierta.rows[0].fecha}.`,
        turno_pendiente_id: abierta.rows[0].turno_id,
        fecha_pendiente: abierta.rows[0].fecha
      });
    }

    const anterior = await cliente.query(
      `SELECT COALESCE(monto_dejado_caja, efectivo_contado) AS efectivo_contado
       FROM cajas_turnos
       WHERE cajero_id = $1 AND fecha <= ${FECHA_HOY}
         AND cerrada_en IS NOT NULL
       ORDER BY fecha DESC, turno_id DESC LIMIT 1`,
      [cajeroId]
    );
    const montoApertura = Number(montoSolicitado);
    const efectivoAnterior = anterior.rowCount
      ? Number(anterior.rows[0].efectivo_contado)
      : null;
    const diferencia = efectivoAnterior === null
      ? 0
      : montoApertura - efectivoAnterior;

    if (Math.abs(diferencia) > 0.01 && !observacion) {
      await cliente.query("ROLLBACK");
      return res.status(409).json({
        mensaje: "Explica por qué el dinero de apertura no coincide con el cierre anterior.",
        apertura_sugerida: efectivoAnterior,
        diferencia_apertura: diferencia
      });
    }

    const creado = await cliente.query(
      `INSERT INTO cajas_turnos (
         cajero_id, fecha, monto_apertura, diferencia_apertura, observacion_apertura
       )
       VALUES ($1, ${FECHA_HOY}, $2, $3, $4)
       RETURNING turno_id, fecha, monto_apertura, diferencia_apertura,
                 observacion_apertura, abierta_en`,
      [
        cajeroId,
        montoApertura.toFixed(2),
        diferencia.toFixed(2),
        observacion || null
      ]
    );

    await cliente.query("COMMIT");
    return res.status(201).json({ mensaje: "Caja abierta.", turno: creado.rows[0] });
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    cliente.release();
  }
}

export async function registrarEgreso(req, res, next) {
  const descripcion = texto(req.body?.descripcion, 250);
  const valor = Number(req.body?.valor);
  if (!descripcion || !montoValido(valor)) {
    return res.status(400).json({
      mensaje: "Describe el gasto e indica un valor mayor a cero."
    });
  }

  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const turno = await cliente.query(
      `SELECT turno_id FROM cajas_turnos
       WHERE cajero_id = $1 AND fecha = ${FECHA_HOY} AND cerrada_en IS NULL
       FOR UPDATE`,
      [Number(req.user.usuario_id)]
    );
    if (!turno.rowCount) {
      await cliente.query("ROLLBACK");
      return res.status(409).json({ mensaje: "Abre la caja antes de registrar gastos." });
    }
    const egreso = await cliente.query(
      `INSERT INTO caja_egresos (turno_id, cajero_id, descripcion, valor)
       VALUES ($1, $2, $3, $4)
       RETURNING egreso_id, descripcion, valor, creado_en`,
      [turno.rows[0].turno_id, Number(req.user.usuario_id), descripcion, valor.toFixed(2)]
    );
    await cliente.query("COMMIT");
    return res.status(201).json({ mensaje: "Gasto registrado.", egreso: egreso.rows[0] });
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    cliente.release();
  }
}

export async function cerrarCaja(req, res, next) {
  const efectivoContado = Number(req.body?.efectivo_contado);
  const montoDejado = Number(req.body?.monto_dejado_caja);
  const turnoId = req.body?.turno_id == null ? null : Number(req.body.turno_id);
  const observacion = texto(req.body?.observacion, 500);
  if (turnoId !== null && (!Number.isSafeInteger(turnoId) || turnoId <= 0)) {
    return res.status(400).json({ mensaje: "El turno de caja indicado no es válido." });
  }
  if (!montoValido(efectivoContado, true)) {
    return res.status(400).json({ mensaje: "Indica cuánto efectivo quedó en la caja." });
  }
  if (!montoValido(montoDejado, true) || montoDejado > efectivoContado) {
    return res.status(400).json({
      mensaje: "El dinero que dejas en caja debe ser igual o menor al efectivo contado."
    });
  }

  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const cajeroId = Number(req.user.usuario_id);
    const turno = await cliente.query(
      `SELECT turno_id, fecha, monto_apertura
       FROM cajas_turnos
       WHERE cajero_id = $1 AND cerrada_en IS NULL
         AND (($2::bigint IS NULL AND fecha = ${FECHA_HOY}) OR turno_id = $2)
       FOR UPDATE`,
      [cajeroId, turnoId]
    );
    if (!turno.rowCount) {
      await cliente.query("ROLLBACK");
      return res.status(409).json({ mensaje: "No hay una caja abierta para cerrar." });
    }
    const esperado = await obtenerEfectivoEsperadoTurno(
      turno.rows[0].turno_id,
      cliente
    );
    const totales = await obtenerTotales(cajeroId, turno.rows[0].fecha, cliente);
    const diferencia = efectivoContado - esperado;
    if (Math.abs(diferencia) > 0.01 && !observacion) {
      await cliente.query("ROLLBACK");
      return res.status(400).json({
        mensaje: "Explica la diferencia entre el efectivo esperado y el contado.",
        efectivo_esperado: esperado,
        diferencia
      });
    }
    const cerrado = await cliente.query(
      `UPDATE cajas_turnos
       SET efectivo_esperado_cierre = $2, efectivo_contado = $3,
           monto_dejado_caja = $4, diferencia_cierre = $5,
           observacion_cierre = $6,
           cerrada_en = CURRENT_TIMESTAMP
       WHERE turno_id = $1
       RETURNING turno_id, fecha, monto_apertura, efectivo_contado,
                 monto_dejado_caja,
                 efectivo_esperado_cierre, diferencia_cierre,
                 observacion_cierre, cerrada_en`,
      [
        turno.rows[0].turno_id,
        esperado.toFixed(2),
        efectivoContado.toFixed(2),
        montoDejado.toFixed(2),
        diferencia.toFixed(2),
        observacion || null
      ]
    );
    await cliente.query("COMMIT");
    return res.json({
      mensaje: Math.abs(diferencia) <= 0.01
        ? "Caja cerrada y cuadrada."
        : "Caja cerrada con diferencia registrada.",
      turno: cerrado.rows[0],
      efectivo_esperado: esperado,
      ...totales
    });
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    cliente.release();
  }
}

export async function obtenerInventarioDiario(req, res, next) {
  try {
    const resultado = await query(
      `SELECT
         p.producto_id, p.nombre, p.unidad_medida, p.stock_actual AS stock_esperado,
         COALESCE(v.vendidas, 0) AS vendidas,
         d.stock_esperado AS stock_esperado_conteo,
         d.unidades_vendidas AS vendidas_conteo,
         d.cantidad_contada, d.diferencia, d.observacion,
         c.conteo_id, c.creado_en AS contado_en
       FROM productos p
       LEFT JOIN (
         SELECT dp.producto_id, SUM(dp.cantidad) AS vendidas
         FROM detalle_pedido dp
         JOIN pedidos pe ON pe.pedido_id = dp.pedido_id
         JOIN ventas ve ON ve.pedido_id = pe.pedido_id AND ve.estado = 'vigente'
         WHERE (ve.fecha_venta AT TIME ZONE 'America/Bogota')::date = ${FECHA_HOY}
         GROUP BY dp.producto_id
       ) v ON v.producto_id = p.producto_id
       LEFT JOIN conteos_inventario c ON c.fecha = ${FECHA_HOY}
       LEFT JOIN conteo_inventario_detalle d
         ON d.producto_id = p.producto_id AND d.conteo_id = c.conteo_id
       WHERE p.controla_inventario = TRUE AND p.eliminado_en IS NULL
       ORDER BY p.nombre`
    );
    const encabezado = await query(
      `SELECT conteo_id, fecha, cajero_id, creado_en
       FROM conteos_inventario WHERE fecha = ${FECHA_HOY}`
    );
    res.json({
      conteo: encabezado.rows[0] || null,
      productos: resultado.rows.map((producto) => ({
        ...producto,
        stock_esperado: producto.stock_esperado_conteo ?? producto.stock_esperado,
        vendidas: producto.vendidas_conteo ?? producto.vendidas
      }))
    });
  } catch (error) {
    next(error);
  }
}

export async function registrarConteoInventario(req, res, next) {
  const conteos = req.body?.productos;
  if (!Array.isArray(conteos)) {
    return res.status(400).json({ mensaje: "Envía el conteo físico de los productos." });
  }
  const cantidades = new Map();
  for (const item of conteos) {
    const productoId = Number(item?.producto_id);
    const cantidad = Number(item?.cantidad_contada);
    if (!Number.isSafeInteger(productoId) || productoId <= 0 ||
        !Number.isSafeInteger(cantidad) || cantidad < 0) {
      return res.status(400).json({ mensaje: "Hay cantidades o productos no válidos en el conteo." });
    }
    cantidades.set(productoId, {
      cantidad,
      observacion: texto(item.observacion, 250)
    });
  }

  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const cajeroId = Number(req.user.usuario_id);
    const turno = await cliente.query(
      `SELECT turno_id FROM cajas_turnos
       WHERE cajero_id = $1 AND fecha = ${FECHA_HOY} AND cerrada_en IS NULL
       FOR UPDATE`,
      [cajeroId]
    );
    if (!turno.rowCount) {
      await cliente.query("ROLLBACK");
      return res.status(409).json({ mensaje: "Abre la caja antes de registrar el inventario." });
    }

    const productos = await cliente.query(
      `SELECT producto_id, stock_actual, nombre
       FROM productos
       WHERE controla_inventario = TRUE AND eliminado_en IS NULL
       ORDER BY producto_id
       FOR UPDATE`
    );
    if (productos.rowCount !== cantidades.size ||
        productos.rows.some((p) => !cantidades.has(Number(p.producto_id)))) {
      await cliente.query("ROLLBACK");
      return res.status(409).json({
        mensaje: "El catálogo cambió. Actualiza el inventario y vuelve a contar."
      });
    }

    const duplicado = await cliente.query(
      `SELECT conteo_id FROM conteos_inventario WHERE fecha = ${FECHA_HOY}`
    );
    if (duplicado.rowCount) {
      await cliente.query("ROLLBACK");
      return res.status(409).json({ mensaje: "El inventario de hoy ya fue contado." });
    }

    const vendido = await cliente.query(
      `SELECT dp.producto_id, SUM(dp.cantidad) AS vendidas
       FROM detalle_pedido dp
       JOIN pedidos pe ON pe.pedido_id = dp.pedido_id
       JOIN ventas ve ON ve.pedido_id = pe.pedido_id AND ve.estado = 'vigente'
       WHERE (ve.fecha_venta AT TIME ZONE 'America/Bogota')::date = ${FECHA_HOY}
       GROUP BY dp.producto_id`
    );
    const ventasPorProducto = new Map(vendido.rows.map((p) => [
      Number(p.producto_id),
      Number(p.vendidas)
    ]));
    const encabezado = await cliente.query(
      `INSERT INTO conteos_inventario (fecha, cajero_id)
       VALUES (${FECHA_HOY}, $1) RETURNING conteo_id`,
      [cajeroId]
    );

    for (const producto of productos.rows) {
      const id = Number(producto.producto_id);
      const stockAnterior = Number(producto.stock_actual);
      const conteo = cantidades.get(id);
      const diferencia = conteo.cantidad - stockAnterior;
      if (diferencia !== 0 && !conteo.observacion) {
        await cliente.query("ROLLBACK");
        return res.status(400).json({
          mensaje: `Explica la diferencia de inventario de "${producto.nombre}".`
        });
      }

      await cliente.query(
        `INSERT INTO conteo_inventario_detalle (
           conteo_id, producto_id, stock_esperado, unidades_vendidas,
           cantidad_contada, diferencia, observacion
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          encabezado.rows[0].conteo_id,
          id,
          stockAnterior,
          ventasPorProducto.get(id) || 0,
          conteo.cantidad,
          diferencia,
          conteo.observacion || null
        ]
      );

      if (diferencia !== 0) {
        await cliente.query(
          `UPDATE productos SET stock_actual = $2 WHERE producto_id = $1`,
          [id, conteo.cantidad]
        );
        await cliente.query(
          `INSERT INTO movimientos_inventario (
             producto_id, usuario_id, pedido_id, tipo, cantidad,
             stock_anterior, stock_nuevo, motivo
           ) VALUES ($1, $2, NULL, $3, $4, $5, $6, $7)`,
          [
            id,
            cajeroId,
            diferencia < 0 ? "salida" : "devolucion",
            Math.abs(diferencia),
            stockAnterior,
            conteo.cantidad,
            `Conteo físico diario: ${conteo.observacion}`
          ]
        );
      }
    }

    await cliente.query("COMMIT");
    return res.status(201).json({
      mensaje: "Conteo guardado. Las diferencias quedaron registradas en el inventario.",
      conteo_id: encabezado.rows[0].conteo_id
    });
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    cliente.release();
  }
}

export async function listarInventarioAdmin(req, res, next) {
  const desde = req.query.desde;
  const hasta = req.query.hasta;
  if (!fechaValida(desde) || !fechaValida(hasta) || desde > hasta) {
    return res.status(400).json({
      mensaje: "Selecciona un rango de fechas válido para consultar movimientos."
    });
  }

  try {
    const [productos, movimientos] = await Promise.all([
      query(
        `SELECT p.producto_id, p.codigo, p.nombre, p.unidad_medida,
                p.stock_actual, p.stock_minimo, p.disponible, p.controla_inventario,
                c.nombre AS categoria
         FROM productos p
         LEFT JOIN categorias c ON c.categoria_id = p.categoria_id
         WHERE p.eliminado_en IS NULL
         ORDER BY p.nombre`
      ),
      query(
        `SELECT mi.*, p.nombre AS producto,
                COALESCE(u.nombres, 'Usuario eliminado') AS usuario
         FROM movimientos_inventario mi
         JOIN productos p ON p.producto_id = mi.producto_id
         LEFT JOIN usuarios u ON u.usuario_id = mi.usuario_id
         CROSS JOIN LATERAL (
           SELECT COALESCE(
             NULLIF(to_jsonb(mi)->>'creado_en', ''),
             NULLIF(to_jsonb(mi)->>'fecha_movimiento', ''),
             NULLIF(to_jsonb(mi)->>'fecha', '')
           )::timestamptz AS fecha
         ) fecha_movimiento
         WHERE fecha_movimiento.fecha >= ($1::date::timestamp AT TIME ZONE 'America/Bogota')
           AND fecha_movimiento.fecha < (($2::date + 1)::timestamp AT TIME ZONE 'America/Bogota')
         ORDER BY fecha_movimiento.fecha DESC, mi.ctid DESC`,
        [desde, hasta]
      )
    ]);

    res.json({ productos: productos.rows, movimientos: movimientos.rows });
  } catch (error) {
    next(error);
  }
}

export async function ajustarInventarioAdmin(req, res, next) {
  const productoId = Number(req.params.productoId);
  const stockNuevo = Number(req.body?.stock_actual);
  const motivo = texto(req.body?.motivo, 250);
  if (!Number.isSafeInteger(productoId) || productoId <= 0 ||
      !Number.isSafeInteger(stockNuevo) || stockNuevo < 0 ||
      !motivo) {
    return res.status(400).json({
      mensaje: "Selecciona un stock entero válido y describe el motivo del ajuste."
    });
  }

  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const producto = await cliente.query(
      `SELECT producto_id, nombre, stock_actual, controla_inventario
       FROM productos
       WHERE producto_id = $1 AND eliminado_en IS NULL
       FOR UPDATE`,
      [productoId]
    );
    if (!producto.rowCount) {
      await cliente.query("ROLLBACK");
      return res.status(404).json({ mensaje: "No se encontró el producto." });
    }
    if (!producto.rows[0].controla_inventario) {
      await cliente.query("ROLLBACK");
      return res.status(409).json({
        mensaje: "Este producto no tiene activo el control de inventario."
      });
    }

    const anterior = Number(producto.rows[0].stock_actual);
    const diferencia = stockNuevo - anterior;
    if (diferencia !== 0) {
      await cliente.query(
        `UPDATE productos SET stock_actual = $2 WHERE producto_id = $1`,
        [productoId, stockNuevo]
      );
      await cliente.query(
        `INSERT INTO movimientos_inventario (
           producto_id, usuario_id, tipo, cantidad,
           stock_anterior, stock_nuevo, motivo
         ) VALUES ($1, $2, 'ajuste', $3, $4, $5, $6)`,
        [
          productoId,
          Number(req.user.usuario_id),
          Math.abs(diferencia),
          anterior,
          stockNuevo,
          motivo
        ]
      );
    }
    await cliente.query("COMMIT");
    return res.json({
      mensaje: diferencia === 0 ? "El inventario ya tenía esa cantidad." : "Inventario actualizado.",
      producto: {
        producto_id: productoId,
        nombre: producto.rows[0].nombre,
        stock_anterior: anterior,
        stock_actual: stockNuevo,
        diferencia
      }
    });
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    cliente.release();
  }
}

export async function obtenerCajaDiariaAdmin(req, res, next) {
  const fecha = req.query.fecha;
  if (!fechaValida(fecha)) {
    return res.status(400).json({ mensaje: "Indica una fecha válida en formato AAAA-MM-DD." });
  }

  try {
    const resultado = await query(
      `SELECT
         t.turno_id, t.fecha, t.cajero_id,
         COALESCE(TRIM(u.nombres || ' ' || COALESCE(u.apellidos, '')), u.nombre_usuario) AS cajero,
         t.monto_apertura, t.efectivo_esperado_cierre,
         t.efectivo_contado, t.monto_dejado_caja,
         t.diferencia_cierre, t.observacion_cierre,
         t.diferencia_apertura, t.observacion_apertura,
         t.abierta_en, t.cerrada_en,
         (t.cerrada_en IS NULL) AS turno_abierto,
         ventas.ingresos, ventas.ingresos_efectivo, ventas.ingresos_digitales,
         egresos.egresos, egresos.detalle AS egresos_detalle,
         COALESCE(t.efectivo_esperado_cierre,
           t.monto_apertura + ventas.ingresos_efectivo - egresos.egresos
         ) AS efectivo_esperado,
         COALESCE(t.efectivo_contado, 0)
           - COALESCE(t.monto_dejado_caja, t.efectivo_contado, 0) AS efectivo_retirado,
         ventas.detalle AS pedidos_detalle
       FROM cajas_turnos t
       LEFT JOIN usuarios u ON u.usuario_id = t.cajero_id
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(SUM(pedidos.total), 0) AS ingresos,
           COALESCE(SUM(pedidos.ingresos_efectivo), 0) AS ingresos_efectivo,
           COALESCE(SUM(pedidos.ingresos_digitales), 0) AS ingresos_digitales,
           COALESCE(
             JSONB_AGG(
               JSONB_BUILD_OBJECT(
                 'venta_id', pedidos.venta_id,
                 'pedido', pedidos.numero_pedido,
                 'numero_dia', pedidos.numero_dia,
                 'total', pedidos.total,
                 'fecha', pedidos.fecha_venta,
                 'pagos', pedidos.pagos
               ) ORDER BY pedidos.fecha_venta
             ),
             '[]'::jsonb
           ) AS detalle
         FROM (
           SELECT v.venta_id, v.total, v.fecha_venta, p.numero_pedido, p.numero_dia,
             COALESCE(SUM(pa.valor) FILTER (WHERE mp.nombre ILIKE '%efectivo%'), 0) AS ingresos_efectivo,
             COALESCE(SUM(pa.valor) FILTER (WHERE mp.nombre NOT ILIKE '%efectivo%'), 0) AS ingresos_digitales,
             JSONB_AGG(
               JSONB_BUILD_OBJECT('metodo_pago', mp.nombre, 'valor', pa.valor)
               ORDER BY mp.nombre
             ) AS pagos
           FROM ventas v
           JOIN pedidos p ON p.pedido_id = v.pedido_id
           JOIN pagos pa ON pa.pedido_id = p.pedido_id AND pa.estado = 'confirmado'
           JOIN metodos_pago mp ON mp.metodo_pago_id = pa.metodo_pago_id
           WHERE v.cajero_id = t.cajero_id
             AND v.estado = 'vigente'
             AND v.fecha_venta >= t.abierta_en
             AND (t.cerrada_en IS NULL OR v.fecha_venta <= t.cerrada_en)
           GROUP BY v.venta_id, v.total, v.fecha_venta, p.numero_pedido, p.numero_dia
         ) pedidos
       ) ventas ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(SUM(e.valor), 0) AS egresos,
           COALESCE(
             JSONB_AGG(
               JSONB_BUILD_OBJECT(
                 'egreso_id', e.egreso_id,
                 'descripcion', e.descripcion,
                 'valor', e.valor,
                 'fecha', e.creado_en
               ) ORDER BY e.creado_en
             ),
             '[]'::jsonb
           ) AS detalle
         FROM caja_egresos e
         WHERE e.turno_id = t.turno_id
       ) egresos ON TRUE
       WHERE t.fecha = $1::date
       ORDER BY t.abierta_en, t.turno_id`,
      [fecha]
    );
    const totales = resultado.rows.reduce((acumulado, turno) => ({
      aperturas: acumulado.aperturas + Number(turno.monto_apertura),
      ingresos: acumulado.ingresos + Number(turno.ingresos),
      ingresos_efectivo: acumulado.ingresos_efectivo + Number(turno.ingresos_efectivo),
      ingresos_digitales: acumulado.ingresos_digitales + Number(turno.ingresos_digitales),
      egresos: acumulado.egresos + Number(turno.egresos),
      efectivo_contado: acumulado.efectivo_contado + Number(turno.efectivo_contado || 0),
      efectivo_dejado: acumulado.efectivo_dejado + Number(turno.monto_dejado_caja || 0),
      ganancias: acumulado.ganancias + Number(turno.ingresos) - Number(turno.egresos)
    }), {
      aperturas: 0,
      ingresos: 0,
      ingresos_efectivo: 0,
      ingresos_digitales: 0,
      egresos: 0,
      efectivo_contado: 0,
      efectivo_dejado: 0,
      ganancias: 0
    });

    res.json({ fecha, turnos: resultado.rows, totales });
  } catch (error) {
    next(error);
  }
}