
import { query } from "../config/db.js";

function validarNombre(nombre) {
  return (
    typeof nombre === "string" &&
    nombre.trim().length >= 2 &&
    nombre.trim().length <= 100
  );
}

// GET /api/categorias
// Público: categorías activas.
export async function listarCategorias(req, res, next) {
  try {
    const result = await query(`
      SELECT
        c.categoria_id,
        c.nombre,
        c.descripcion,
        c.imagen_url,
        c.orden_visualizacion,
        COUNT(p.producto_id)::INTEGER AS cantidad_productos
      FROM categorias c
      LEFT JOIN productos p
        ON p.categoria_id = c.categoria_id
       AND p.disponible = TRUE
       AND p.eliminado_en IS NULL
      WHERE c.activa = TRUE
      GROUP BY c.categoria_id
      ORDER BY c.orden_visualizacion, c.nombre
    `);

    res.json({ ok: true, categorias: result.rows });
  } catch (error) {
    next(error);
  }
}

// GET /api/categorias/admin
// Solo administrador: incluye categorías inactivas.
export async function listarTodasCategorias(req, res, next) {
  try {
    const result = await query(`
      SELECT
        c.*,
        COUNT(p.producto_id)::INTEGER AS cantidad_productos
      FROM categorias c
      LEFT JOIN productos p
        ON p.categoria_id = c.categoria_id
       AND p.eliminado_en IS NULL
      GROUP BY c.categoria_id
      ORDER BY c.orden_visualizacion, c.nombre
    `);

    res.json({ ok: true, categorias: result.rows });
  } catch (error) {
    next(error);
  }
}

// POST /api/categorias
export async function crearCategoria(req, res, next) {
  try {
    const { nombre, descripcion, imagen_url, orden_visualizacion } = req.body;

    if (!validarNombre(nombre)) {
      return res.status(400).json({
        ok: false,
        message: "El nombre debe tener entre 2 y 100 caracteres."
      });
    }

    if (
      orden_visualizacion !== undefined &&
      (!Number.isInteger(orden_visualizacion) ||
        orden_visualizacion < 0)
    ) {
      return res.status(400).json({
        ok: false,
        message: "El orden debe ser un entero no negativo."
      });
    }

    const result = await query(
      `INSERT INTO categorias
        (nombre, descripcion, imagen_url, orden_visualizacion)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        nombre.trim(),
        descripcion?.trim() || null,
        imagen_url?.trim() || null,
        orden_visualizacion ?? 0
      ]
    );

    res.status(201).json({
      ok: true,
      message: "Categoría creada correctamente.",
      categoria: result.rows[0]
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message: "Ya existe una categoría con ese nombre."
      });
    }
    next(error);
  }
}

// PUT /api/categorias/:id
export async function actualizarCategoria(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { nombre, descripcion, imagen_url, orden_visualizacion, activa } =
      req.body;

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        ok: false,
        message: "Identificador de categoría inválido."
      });
    }

    if (!validarNombre(nombre)) {
      return res.status(400).json({
        ok: false,
        message: "El nombre debe tener entre 2 y 100 caracteres."
      });
    }

    if (activa !== undefined && typeof activa !== "boolean") {
      return res.status(400).json({
        ok: false,
        message: "El campo activa debe ser verdadero o falso."
      });
    }

    if (
      orden_visualizacion !== undefined &&
      (!Number.isInteger(orden_visualizacion) ||
        orden_visualizacion < 0)
    ) {
      return res.status(400).json({
        ok: false,
        message: "El orden debe ser un entero no negativo."
      });
    }

    const result = await query(
      `UPDATE categorias
       SET nombre = $1,
           descripcion = $2,
           imagen_url = $3,
           orden_visualizacion = $4,
           activa = COALESCE($5, activa)
       WHERE categoria_id = $6
       RETURNING *`,
      [
        nombre.trim(),
        descripcion?.trim() || null,
        imagen_url?.trim() || null,
        orden_visualizacion ?? 0,
        activa ?? null,
        id
      ]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        ok: false,
        message: "Categoría no encontrada."
      });
    }

    res.json({
      ok: true,
      message: "Categoría actualizada correctamente.",
      categoria: result.rows[0]
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message: "Ya existe una categoría con ese nombre."
      });
    }
    next(error);
  }
}

// DELETE /api/categorias/:id
// Desactivación lógica, no borrado físico.
export async function desactivarCategoria(req, res, next) {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
      return res.status(400).json({
        ok: false,
        message: "Identificador de categoría inválido."
      });
    }

    const result = await query(
      `UPDATE categorias
       SET activa = FALSE
       WHERE categoria_id = $1
       RETURNING categoria_id, nombre, activa`,
      [id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        ok: false,
        message: "Categoría no encontrada."
      });
    }

    res.json({
      ok: true,
      message: "Categoría desactivada correctamente.",
      categoria: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
}
