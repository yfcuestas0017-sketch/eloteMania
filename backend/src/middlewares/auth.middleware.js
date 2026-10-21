import jwt from "jsonwebtoken";
import { query } from "../config/db.js";

export async function authenticate(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({
      ok: false,
      message: "Debes iniciar sesión"
    });
  }

  const token = authorization.slice(7);

  let payload;

  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, {
      issuer: "restaurante-pos",
      audience: "restaurante-pos-web"
    });
  } catch {
    return res.status(401).json({
      ok: false,
      message: "Sesión inválida o expirada"
    });
  }

  const usuarioId = Number(payload.sub);

  if (!Number.isSafeInteger(usuarioId) || usuarioId <= 0) {
    return res.status(401).json({
      ok: false,
      message: "Token inválido"
    });
  }

  try {
    // Se consulta la BD para que desactivar un usuario o cambiarle los roles
    // tenga efecto inmediato, sin esperar a que expire el token.
    const result = await query(
      `SELECT
         u.activo,
         COALESCE(
           ARRAY_AGG(r.nombre ORDER BY r.nombre)
             FILTER (WHERE r.nombre IS NOT NULL),
           ARRAY[]::VARCHAR[]
         ) AS roles
       FROM usuarios u
       LEFT JOIN usuario_roles ur ON ur.usuario_id = u.usuario_id
       LEFT JOIN roles r ON r.rol_id = ur.rol_id AND r.activo = TRUE
       WHERE u.usuario_id = $1
       GROUP BY u.usuario_id`,
      [usuarioId]
    );

    const usuario = result.rows[0];

    if (!usuario || !usuario.activo) {
      return res.status(401).json({
        ok: false,
        message: "La cuenta no está activa"
      });
    }

    req.user = {
      id: usuarioId,
      usuario_id: usuarioId,
      roles: usuario.roles
    };

    next();
  } catch (error) {
    next(error);
  }
}

export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        ok: false,
        message: "Debes iniciar sesión"
      });
    }

    const authorized = req.user.roles.some((role) =>
      allowedRoles.includes(role)
    );

    if (!authorized) {
      return res.status(403).json({
        ok: false,
        message: "No tienes permiso para realizar esta acción"
      });
    }

    next();
  };
}
