import pool, { query } from "../config/db.js";

function validarProductos(productoIds) {
  return (
    Array.isArray(productoIds) &&
    productoIds.length > 0 &&
    productoIds.every(
      (id) => Number.isSafeInteger(Number(id)) && Number(id) > 0
    )
  );
}

function validarAdicional({ nombre, precio, producto_ids }) {
  return (
    typeof nombre === "string" &&
    nombre.trim().length >= 2 &&
    nombre.trim().length <= 100 &&
    typeof precio === "number" &&
    Number.isFinite(precio) &&
    precio >= 0 &&
    precio <= 9999999999.99 &&
    validarProductos(producto_ids)
  );
}

const SQL_ADICIONALES = `
  SELECT
    a.adicional_id,
    a.nombre,
    a.precio,
    a.activo,
    a.creado_en,
    COALESCE(
      json_agg(
        json_build_object(
          'producto_id', p.producto_id,
          'nombre', p.nombre
        )
        ORDER BY p.nombre
      ) FILTER (WHERE p.producto_id IS NOT NULL),
      '[]'::json
    ) AS productos
  FROM adicionales a
  LEFT JOIN adicionales_productos ap
    ON ap.adicional_id = a.adicional_id
  LEFT JOIN productos p
    ON p.producto_id = ap.producto_id
  GROUP BY a.adicional_id
  ORDER BY a.nombre
`;

export async function listarAdicionales(req, res, next) {
  try {
    const resultado = await query(SQL_ADICIONALES);
    return res.json({ adicionales: resultado.rows });
  } catch (error) {
    return next(error);
  }
}

export async function listarAdicionalesParaVenta(req, res, next) {
  try {
    const resultado = await query(
      `SELECT adicional_id, nombre, precio
       FROM adicionales
       WHERE activo = TRUE
       ORDER BY nombre`
    );
    return res.json({ adicionales: resultado.rows });
  } catch (error) {
    return next(error);
  }
}

export async function crearAdicional(req, res, next) {
  const { nombre, precio, producto_ids } = req.body;

  if (!validarAdicional({ nombre, precio, producto_ids })) {
    return res.status(400).json({
      mensaje:
        "Indica un nombre, precio y al menos un producto válido para el adicional."
    });
  }

  const ids = [...new Set(producto_ids.map(Number))];
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");
    const productos = await cliente.query(
      `SELECT producto_id
       FROM productos
       WHERE producto_id = ANY($1::bigint[])
         AND eliminado_en IS NULL
       FOR UPDATE`,
      [ids]
    );

    if (productos.rowCount !== ids.length) {
      await cliente.query("ROLLBACK");
      return res.status(400).json({
        mensaje: "Uno o más productos no existen o no están disponibles."
      });
    }

    const creado = await cliente.query(
      `INSERT INTO adicionales (producto_id, nombre, precio)
       VALUES ($1, $2, $3)
       RETURNING adicional_id`,
      [ids[0], nombre.trim(), precio]
    );

    await cliente.query(
      `INSERT INTO adicionales_productos (adicional_id, producto_id)
       SELECT $1, unnest($2::bigint[])`,
      [creado.rows[0].adicional_id, ids]
    );
    const resultado = await cliente.query(SQL_ADICIONALES);
    await cliente.query("COMMIT");

    const adicional = resultado.rows.find(
      (fila) =>
        Number(fila.adicional_id) === Number(creado.rows[0].adicional_id)
    );
    return res.status(201).json({
      mensaje: "Adicional creado correctamente.",
      adicional
    });
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => {});
    return next(error);
  } finally {
    cliente.release();
  }
}

export async function actualizarAdicional(req, res, next) {
  const id = Number(req.params.id);
  const { nombre, precio, producto_ids, activo } = req.body;

  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ mensaje: "Identificador no válido." });
  }
  if (
    !validarAdicional({ nombre, precio, producto_ids }) ||
    (activo !== undefined && typeof activo !== "boolean")
  ) {
    return res.status(400).json({
      mensaje:
        "Indica un nombre, precio, estado y al menos un producto válido."
    });
  }

  const ids = [...new Set(producto_ids.map(Number))];
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");
    const productos = await cliente.query(
      `SELECT producto_id
       FROM productos
       WHERE producto_id = ANY($1::bigint[])
         AND eliminado_en IS NULL
       FOR UPDATE`,
      [ids]
    );
    if (productos.rowCount !== ids.length) {
      await cliente.query("ROLLBACK");
      return res.status(400).json({
        mensaje: "Uno o más productos no existen o no están disponibles."
      });
    }

    const actualizado = await cliente.query(
      `UPDATE adicionales
       SET producto_id = $1,
           nombre = $2,
           precio = $3,
           activo = COALESCE($4, activo)
       WHERE adicional_id = $5
       RETURNING adicional_id`,
      [ids[0], nombre.trim(), precio, activo ?? null, id]
    );
    if (!actualizado.rowCount) {
      await cliente.query("ROLLBACK");
      return res.status(404).json({ mensaje: "Adicional no encontrado." });
    }

    await cliente.query(
      "DELETE FROM adicionales_productos WHERE adicional_id = $1",
      [id]
    );
    await cliente.query(
      `INSERT INTO adicionales_productos (adicional_id, producto_id)
       SELECT $1, unnest($2::bigint[])`,
      [id, ids]
    );
    const resultado = await cliente.query(SQL_ADICIONALES);
    await cliente.query("COMMIT");

    const adicional = resultado.rows.find(
      (fila) => Number(fila.adicional_id) === id
    );
    return res.json({ mensaje: "Adicional actualizado.", adicional });
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => {});
    return next(error);
  } finally {
    cliente.release();
  }
}

export async function eliminarAdicional(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return res.status(400).json({ mensaje: "Identificador no válido." });
  }

  try {
    const resultado = await query(
      `UPDATE adicionales
       SET activo = FALSE
       WHERE adicional_id = $1
       RETURNING adicional_id`,
      [id]
    );
    if (!resultado.rowCount) {
      return res.status(404).json({ mensaje: "Adicional no encontrado." });
    }
    return res.json({ mensaje: "Adicional desactivado correctamente." });
  } catch (error) {
    return next(error);
  }
}
