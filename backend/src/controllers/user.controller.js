import bcrypt from "bcrypt";
import pool, { query } from "../config/db.js";

const ROLES_VALIDOS = ["ADMIN", "CAJERO"];

function validarId(id) {
  return Number.isSafeInteger(id) && id > 0;
}

function validarRoles(roles) {
  return (
    Array.isArray(roles) &&
    roles.length > 0 &&
    roles.every((rol) => ROLES_VALIDOS.includes(rol))
  );
}

function texto(valor) {
  return typeof valor === "string" ? valor.trim() : "";
}

const SELECT_USUARIOS = `
  SELECT
    u.usuario_id,
    u.nombres,
    u.apellidos,
    u.correo,
    u.telefono,
    u.nombre_usuario,
    u.activo,
    u.ultimo_acceso,
    COALESCE(
      ARRAY_AGG(r.nombre ORDER BY r.nombre)
        FILTER (WHERE r.nombre IS NOT NULL),
      ARRAY[]::VARCHAR[]
    ) AS roles
  FROM usuarios u
  LEFT JOIN usuario_roles ur ON ur.usuario_id = u.usuario_id
  LEFT JOIN roles r ON r.rol_id = ur.rol_id AND r.activo = TRUE
`;

// GET /api/users
export async function listarUsuarios(req, res, next) {
  try {
    const result = await query(
      `${SELECT_USUARIOS}
       GROUP BY u.usuario_id
       ORDER BY u.nombres, u.apellidos`
    );

    res.json({ ok: true, usuarios: result.rows });
  } catch (error) {
    next(error);
  }
}

// POST /api/users
export async function crearUsuario(req, res, next) {
  const nombres = texto(req.body.nombres);
  const apellidos = texto(req.body.apellidos);
  const correo = texto(req.body.correo);
  const telefono = texto(req.body.telefono);
  const nombreUsuario = texto(req.body.nombre_usuario);
  const { contrasena, roles } = req.body;

  if (nombres.length < 2 || nombres.length > 100) {
    return res.status(400).json({
      ok: false,
      message: "Los nombres deben tener entre 2 y 100 caracteres."
    });
  }

  if (!/^[A-Za-z0-9._-]{3,50}$/.test(nombreUsuario)) {
    return res.status(400).json({
      ok: false,
      message:
        "El usuario debe tener de 3 a 50 caracteres (letras, números, punto, guion o guion bajo)."
    });
  }

  if (
    typeof contrasena !== "string" ||
    contrasena.length < 8 ||
    contrasena.length > 72
  ) {
    return res.status(400).json({
      ok: false,
      message: "La contraseña debe tener entre 8 y 72 caracteres."
    });
  }

  if (!validarRoles(roles)) {
    return res.status(400).json({
      ok: false,
      message: "Selecciona al menos un rol válido (ADMIN o CAJERO)."
    });
  }

  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");

    const hash = await bcrypt.hash(contrasena, 12);

    const creado = await cliente.query(
      `INSERT INTO usuarios
         (nombres, apellidos, correo, telefono, nombre_usuario, contrasena_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING usuario_id`,
      [
        nombres,
        apellidos || null,
        correo || null,
        telefono || null,
        nombreUsuario,
        hash
      ]
    );

    await cliente.query(
      `INSERT INTO usuario_roles (usuario_id, rol_id)
       SELECT $1, rol_id FROM roles
       WHERE nombre = ANY($2::varchar[]) AND activo = TRUE`,
      [creado.rows[0].usuario_id, roles]
    );

    await cliente.query("COMMIT");

    res.status(201).json({
      ok: true,
      message: "Usuario creado correctamente.",
      usuario_id: creado.rows[0].usuario_id
    });
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => {});

    if (error.code === "23505") {
      return res.status(409).json({
        ok: false,
        message: "Ese nombre de usuario ya está registrado."
      });
    }

    next(error);
  } finally {
    cliente.release();
  }
}

// PATCH /api/users/:id/estado
export async function cambiarEstadoUsuario(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { activo } = req.body;

    if (!validarId(id) || typeof activo !== "boolean") {
      return res.status(400).json({
        ok: false,
        message: "Datos inválidos."
      });
    }

    if (id === req.user.usuario_id && !activo) {
      return res.status(400).json({
        ok: false,
        message: "No puedes desactivar tu propia cuenta."
      });
    }

    const result = await query(
      `UPDATE usuarios SET activo = $1
       WHERE usuario_id = $2
       RETURNING usuario_id, activo`,
      [activo, id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        ok: false,
        message: "Usuario no encontrado."
      });
    }

    res.json({ ok: true, message: "Estado actualizado.", usuario: result.rows[0] });
  } catch (error) {
    next(error);
  }
}

// DELETE /api/users/:id
export async function eliminarUsuario(req, res, next) {
  const id = Number(req.params.id);

  if (!validarId(id)) {
    return res.status(400).json({
      ok: false,
      message: "Identificador de usuario inválido."
    });
  }

  if (id === req.user.usuario_id) {
    return res.status(400).json({
      ok: false,
      message: "No puedes eliminar tu propia cuenta."
    });
  }

  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");

    const usuario = await cliente.query(
      `SELECT usuario_id
       FROM usuarios
       WHERE usuario_id = $1
       FOR UPDATE`,
      [id]
    );

    if (!usuario.rowCount) {
      await cliente.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        message: "Usuario no encontrado."
      });
    }

    const esAdministrador = await cliente.query(
      `SELECT 1
       FROM usuario_roles ur
       JOIN roles r ON r.rol_id = ur.rol_id
       WHERE ur.usuario_id = $1 AND r.nombre = 'ADMIN'`,
      [id]
    );

    if (esAdministrador.rowCount) {
      const otrosAdministradores = await cliente.query(
        `SELECT COUNT(*)::INTEGER AS cantidad
         FROM usuario_roles ur
         JOIN roles r ON r.rol_id = ur.rol_id
         WHERE r.nombre = 'ADMIN' AND ur.usuario_id <> $1`,
        [id]
      );

      if (otrosAdministradores.rows[0].cantidad === 0) {
        await cliente.query("ROLLBACK");
        return res.status(409).json({
          ok: false,
          message: "No puedes eliminar al último usuario administrador."
        });
      }
    }

    await cliente.query(
      "DELETE FROM usuario_roles WHERE usuario_id = $1",
      [id]
    );
    await cliente.query("DELETE FROM usuarios WHERE usuario_id = $1", [id]);
    await cliente.query("COMMIT");

    return res.json({
      ok: true,
      message: "Usuario eliminado permanentemente."
    });
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => {});

    if (error.code === "23503") {
      return res.status(409).json({
        ok: false,
        message:
          "No se puede eliminar este usuario porque tiene pedidos, pagos o movimientos de inventario asociados. Desactívalo para conservar el historial."
      });
    }

    return next(error);
  } finally {
    cliente.release();
  }
}

// PUT /api/users/:id/roles
export async function actualizarRolesUsuario(req, res, next) {
  const id = Number(req.params.id);
  const { roles } = req.body;

  if (!validarId(id) || !validarRoles(roles)) {
    return res.status(400).json({
      ok: false,
      message: "Indica al menos un rol válido (ADMIN o CAJERO)."
    });
  }

  if (id === req.user.usuario_id && !roles.includes("ADMIN")) {
    return res.status(400).json({
      ok: false,
      message: "No puedes quitarte a ti mismo el rol ADMIN."
    });
  }

  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");

    const existe = await cliente.query(
      "SELECT 1 FROM usuarios WHERE usuario_id = $1",
      [id]
    );

    if (!existe.rowCount) {
      await cliente.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        message: "Usuario no encontrado."
      });
    }

    await cliente.query("DELETE FROM usuario_roles WHERE usuario_id = $1", [id]);

    await cliente.query(
      `INSERT INTO usuario_roles (usuario_id, rol_id)
       SELECT $1, rol_id FROM roles
       WHERE nombre = ANY($2::varchar[]) AND activo = TRUE`,
      [id, roles]
    );

    await cliente.query("COMMIT");

    res.json({ ok: true, message: "Roles actualizados." });
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => {});
    next(error);
  } finally {
    cliente.release();
  }
}

// PUT /api/users/:id/password
export async function restablecerContrasena(req, res, next) {
  try {
    const id = Number(req.params.id);
    const { contrasena } = req.body;

    if (
      !validarId(id) ||
      typeof contrasena !== "string" ||
      contrasena.length < 8 ||
      contrasena.length > 72
    ) {
      return res.status(400).json({
        ok: false,
        message: "La contraseña debe tener entre 8 y 72 caracteres."
      });
    }

    const hash = await bcrypt.hash(contrasena, 12);

    const result = await query(
      `UPDATE usuarios SET contrasena_hash = $1
       WHERE usuario_id = $2
       RETURNING usuario_id`,
      [hash, id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        ok: false,
        message: "Usuario no encontrado."
      });
    }

    res.json({ ok: true, message: "Contraseña actualizada." });
  } catch (error) {
    next(error);
  }
}
