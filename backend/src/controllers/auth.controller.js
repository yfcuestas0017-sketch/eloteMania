
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { query } from "../config/db.js";

export async function login(req, res, next) {
  try {
    const { nombre_usuario, contrasena } = req.body;

    if (
      typeof nombre_usuario !== "string" ||
      typeof contrasena !== "string" ||
      !nombre_usuario.trim() ||
      !contrasena ||
      contrasena.length > 1024
    ) {
      return res.status(400).json({
        ok: false,
        message: "Ingresa tu usuario y contraseña"
      });
    }

    const result = await query(
      `SELECT
          u.usuario_id,
          u.nombres,
          u.apellidos,
          u.nombre_usuario,
          u.contrasena_hash,
          u.activo,
          COALESCE(
            ARRAY_AGG(r.nombre ORDER BY r.nombre)
              FILTER (WHERE r.nombre IS NOT NULL),
            ARRAY[]::VARCHAR[]
          ) AS roles
       FROM usuarios u
       LEFT JOIN usuario_roles ur
         ON ur.usuario_id = u.usuario_id
       LEFT JOIN roles r
         ON r.rol_id = ur.rol_id AND r.activo = TRUE
       WHERE LOWER(u.nombre_usuario) = LOWER($1)
       GROUP BY u.usuario_id`,
      [nombre_usuario.trim()]
    );

    const user = result.rows[0];

    // Mensaje genérico para no revelar si una cuenta existe.
    if (!user || !user.activo) {
      return res.status(401).json({
        ok: false,
        message: "Usuario o contraseña incorrectos"
      });
    }

    const passwordMatches = await bcrypt.compare(
      contrasena,
      user.contrasena_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        ok: false,
        message: "Usuario o contraseña incorrectos"
      });
    }

    if (user.roles.length === 0) {
      return res.status(403).json({
        ok: false,
        message: "La cuenta no tiene roles activos"
      });
    }

    await query(
      `UPDATE usuarios
       SET ultimo_acceso = CURRENT_TIMESTAMP
       WHERE usuario_id = $1`,
      [user.usuario_id]
    );

    const token = jwt.sign(
      { roles: user.roles },
      process.env.JWT_SECRET,
      {
        subject: String(user.usuario_id),
        expiresIn: process.env.JWT_EXPIRES_IN || "2h",
        issuer: "restaurante-pos",
        audience: "restaurante-pos-web"
      }
    );

    return res.json({
      ok: true,
      message: "Inicio de sesión exitoso",
      token,
      usuario: {
        id: user.usuario_id,
        nombres: user.nombres,
        apellidos: user.apellidos,
        nombre_usuario: user.nombre_usuario,
        roles: user.roles
      }
    });
  } catch (error) {
    next(error);
  }
}
