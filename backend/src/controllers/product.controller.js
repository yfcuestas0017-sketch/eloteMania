import { query } from "../config/db.js";

function validarId(id) {
  return Number.isSafeInteger(id) && id > 0;
}

function validarProducto(data) {
  return (
    typeof data.nombre === "string" &&
    data.nombre.trim().length >= 2 &&
    data.nombre.trim().length <= 150 &&
    typeof data.precio === "number" &&
    Number.isFinite(data.precio) &&
    data.precio >= 0 &&
    data.precio <= 9999999999.99
  );
}

function validarUrl(url) {
  if (url == null || url === "") return true;

  if (typeof url !== "string" || url.length > 2048) {
    return false;
  }

  if (url.startsWith("/uploads/") || url.startsWith("uploads/")) {
    return true;
  }

  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

// GET /api/productos
// Menú público: productos disponibles y categorías activas.
export async function listarProductosPublicos(req, res, next) {
  try {
    const { categoria, buscar } = req.query;
    const params = [];
    const conditions = [
      "p.eliminado_en IS NULL",
      "p.disponible = TRUE",
      "c.activa = TRUE"
    ];

    if (categoria !== undefined) {
      const categoriaId = Number(categoria);

      if (!validarId(categoriaId)) {
        return res.status(400).json({
          ok: false,
          message: "Categoría inválida."
        });
      }

      params.push(categoriaId);
      conditions.push(`p.categoria_id = $${params.length}`);
    }

    if (buscar !== undefined) {
      if (typeof buscar !== "string" || buscar.trim().length > 100) {
        return res.status(400).json({
          ok: false,
          message: "El texto de búsqueda no es válido."
        });
      }

      params.push(`%${buscar.trim()}%`);
      conditions.push(`(p.nombre ILIKE $${params.length} OR p.descripcion ILIKE $${params.length} OR c.nombre ILIKE $${params.length})`);
    }

    const result = await query(
      `SELECT
          p.producto_id,
          p.codigo,
          p.nombre,
          p.descripcion,
          p.imagen_url,
          p.precio,
          p.unidad_medida,
          p.categoria_id,
          p.controla_inventario,
          p.stock_actual,
          p.disponible,
          c.nombre AS categoria,
          COALESCE(
            (
              SELECT json_agg(
                json_build_object(
                  'adicional_id', a.adicional_id,
                  'nombre', a.nombre,
                  'precio', a.precio
                )
                ORDER BY a.nombre
              )
              FROM adicionales a
              JOIN adicionales_productos ap
                ON ap.adicional_id = a.adicional_id
              WHERE ap.producto_id = p.producto_id
                AND a.activo = TRUE
            ),
            '[]'::json
          ) AS adicionales
       FROM productos p
       JOIN categorias c ON c.categoria_id = p.categoria_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY c.orden_visualizacion, c.nombre, p.nombre`,
      params
    );

    res.json({
      ok: true,
      cantidad: result.rowCount,
      productos: result.rows
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/productos/admin
// Solo administrador: incluye productos desactivados.
export async function listarProductosAdmin(req, res, next) {
  try {
    const result = await query(`
      SELECT
        p.*,
        c.nombre AS categoria
      FROM productos p
      LEFT JOIN categorias c ON c.categoria_id = p.categoria_id
      ORDER BY p.creado_en DESC, p.producto_id DESC
    `);

    res.json({
      ok: true,
      cantidad: result.rowCount,
      productos: result.rows
    });
  } catch (error) {
    next(error);
  }
}

// POST /api/productos
export async function crearProducto(req, res, next) {
  try {
    const {
      categoria_id,
      codigo,
      nombre,
      descripcion,
      imagen_url,
      precio,
      controla_inventario = true,
      stock_actual = 0,
      stock_minimo = 0,
      unidad_medida = "unidad",
      disponible = true
    } = req.body;

    if (!validarProducto({ nombre, precio })) {
      return res.status(400).json({
        ok: false,
        message: "Nombre o precio inválido."
      });
    }

    if (
      categoria_id != null &&
      !validarId(categoria_id)
    ) {
      return res.status(400).json({
        ok: false,
        message: "La categoría no es válida."
      });
    }

    const stockActualNum = Number(stock_actual);
    const stockMinimoNum = Number(stock_minimo);

    if (
      typeof controla_inventario !== "boolean" ||
      typeof disponible !== "boolean" ||
      !Number.isFinite(stockActualNum) ||
      stockActualNum < 0 ||
      !Number.isFinite(stockMinimoNum) ||
      stockMinimoNum < 0
    ) {
      return res.status(400).json({
        ok: false,
        message: "Los valores de inventario o disponibilidad son inválidos."
      });
    }

    if (!validarUrl(imagen_url)) {
      return res.status(400).json({
        ok: false,
        message: "La imagen debe tener una URL o foto válida."
      });
    }

    if (
      unidad_medida !== undefined &&
      (typeof unidad_medida !== "string" ||
        unidad_medida.trim().length < 1 ||
        unidad_medida.trim().length > 20)
    ) {
      return res.status(400).json({
        ok: false,
        message: "Unidad de medida inválida."
      });
    }

    if (categoria_id != null) {
      const categoria = await query(
        `SELECT categoria_id
         FROM categorias
         WHERE categoria_id = $1 AND activa = TRUE`,
        [categoria_id]
      );

      if (!categoria.rowCount) {
        return res.status(400).json({
          ok: false,
          message: "La categoría no existe o está inactiva."
        });
      }
    }

    const result = await query(
      `INSERT INTO productos (
        categoria_id, codigo, nombre, descripcion, imagen_url,
        precio, controla_inventario, stock_actual, stock_minimo,
        unidad_medida, disponible
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        categoria_id ?? null,
        codigo?.trim() || null,
        nombre.trim(),
        descripcion?.trim() || null,
        imagen_url?.trim() || null,
        precio,
        controla_inventario,
        stockActualNum,
        stockMinimoNum,
        unidad_medida.trim(),
        disponible
      ]
    );

    const nuevoProducto = result.rows[0];

    // Registro automático de auditoría en movimientos de inventario si hay stock inicial
    if (stockActualNum > 0 && req.user?.usuario_id) {
      try {
        await query(
          `INSERT INTO movimientos_inventario (
             producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo
           ) VALUES ($1, $2, 'entrada', $3, 0, $3, 'Stock inicial al crear producto')`,
          [nuevoProducto.producto_id, req.user.usuario_id, stockActualNum]
        );
      } catch (errMov) {
        console.warn("Aviso: no se pudo registrar movimiento inicial en auditoría:", errMov.message);
      }
    }

    res.status(201).json({
      ok: true,
      message: "Producto creado correctamente con su stock.",
      producto: nuevoProducto
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message: "El código del producto ya existe."
      });
    }
    next(error);
  }
}

// PUT /api/productos/:id
export async function actualizarProducto(req, res, next) {
  try {
    const id = Number(req.params.id);

    if (!validarId(id)) {
      return res.status(400).json({
        ok: false,
        message: "Identificador de producto inválido."
      });
    }

    const {
      categoria_id,
      codigo,
      nombre,
      descripcion,
      imagen_url,
      precio,
      controla_inventario,
      stock_actual,
      stock_minimo,
      unidad_medida,
      disponible
    } = req.body;

    if (!validarProducto({ nombre, precio })) {
      return res.status(400).json({
        ok: false,
        message: "Nombre o precio inválido."
      });
    }

    if (
      categoria_id != null &&
      !validarId(categoria_id)
    ) {
      return res.status(400).json({
        ok: false,
        message: "Categoría inválida."
      });
    }

    const stockActualNum = stock_actual !== undefined ? Number(stock_actual) : undefined;
    const stockMinimoNum = stock_minimo !== undefined ? Number(stock_minimo) : undefined;

    if (
      !validarUrl(imagen_url) ||
      (controla_inventario !== undefined &&
        typeof controla_inventario !== "boolean") ||
      (disponible !== undefined && typeof disponible !== "boolean") ||
      (stockActualNum !== undefined &&
        (!Number.isFinite(stockActualNum) || stockActualNum < 0)) ||
      (stockMinimoNum !== undefined &&
        (!Number.isFinite(stockMinimoNum) || stockMinimoNum < 0)) ||
      (unidad_medida !== undefined &&
        (typeof unidad_medida !== "string" ||
          unidad_medida.trim().length < 1 ||
          unidad_medida.trim().length > 20))
    ) {
      return res.status(400).json({
        ok: false,
        message: "Hay datos inválidos en el producto."
      });
    }

    if (categoria_id != null) {
      const categoria = await query(
        `SELECT categoria_id
         FROM categorias
         WHERE categoria_id = $1 AND activa = TRUE`,
        [categoria_id]
      );

      if (!categoria.rowCount) {
        return res.status(400).json({
          ok: false,
          message: "La categoría no existe o está inactiva."
        });
      }
    }

    // Obtener stock anterior para auditar el cambio
    const productoPrevio = await query(
      `SELECT stock_actual, controla_inventario FROM productos WHERE producto_id = $1`,
      [id]
    );

    const result = await query(
      `UPDATE productos
       SET categoria_id = $1,
           codigo = $2,
           nombre = $3,
           descripcion = $4,
           imagen_url = $5,
           precio = $6,
           controla_inventario = $7,
           stock_actual = $8,
           stock_minimo = $9,
           unidad_medida = $10,
           disponible = $11
       WHERE producto_id = $12
         AND eliminado_en IS NULL
       RETURNING *`,
      [
        categoria_id ?? null,
        codigo?.trim() || null,
        nombre.trim(),
        descripcion?.trim() || null,
        imagen_url?.trim() || null,
        precio,
        controla_inventario ?? false,
        stockActualNum ?? 0,
        stockMinimoNum ?? 0,
        unidad_medida?.trim() || "unidad",
        disponible ?? true,
        id
      ]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        ok: false,
        message: "Producto no encontrado."
      });
    }

    const productoActualizado = result.rows[0];

    // Registro automático en movimientos de inventario si el stock fue modificado
    if (
      productoPrevio.rowCount > 0 &&
      req.user?.usuario_id &&
      stockActualNum !== undefined
    ) {
      const stockAnterior = Number(productoPrevio.rows[0].stock_actual);
      if (stockActualNum !== stockAnterior) {
        const diff = Math.abs(stockActualNum - stockAnterior);
        if (diff > 0) {
          try {
            await query(
              `INSERT INTO movimientos_inventario (
                 producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo
               ) VALUES ($1, $2, 'ajuste', $3, $4, $5, 'Modificación directa de stock desde administración')`,
              [id, req.user.usuario_id, diff, stockAnterior, stockActualNum]
            );
          } catch (errMov) {
            console.warn("Aviso: no se pudo registrar ajuste en auditoría:", errMov.message);
          }
        }
      }
    }

    res.json({
      ok: true,
      message: "Producto y stock actualizados correctamente.",
      producto: productoActualizado
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message: "El código del producto ya está registrado."
      });
    }
    next(error);
  }
}

// DELETE /api/productos/:id
// Desactivación lógica para conservar el historial.
export async function desactivarProducto(req, res, next) {
  try {
    const id = Number(req.params.id);

    if (!validarId(id)) {
      return res.status(400).json({
        ok: false,
        message: "Identificador de producto inválido."
      });
    }

    const result = await query(
      `UPDATE productos
       SET disponible = FALSE,
           eliminado_en = CURRENT_TIMESTAMP
       WHERE producto_id = $1
         AND eliminado_en IS NULL
       RETURNING producto_id, nombre, disponible, eliminado_en`,
      [id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        ok: false,
        message: "Producto no encontrado o ya desactivado."
      });
    }

    res.json({
      ok: true,
      message: "Producto desactivado correctamente.",
      producto: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
}
