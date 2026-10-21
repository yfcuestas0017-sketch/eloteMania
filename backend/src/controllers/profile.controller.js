import bcrypt from "bcrypt";
import { query } from "../config/db.js";

const COLUMNAS_PERFIL = `
  u.usuario_id,
  u.nombres,
  u.apellidos,
  u.correo,
  u.telefono,
  u.nombre_usuario,
  u.ultimo_acceso,
  u.creado_en`;

async function leerPerfil(usuarioId) {
  const resultado = await query(
    `SELECT ${COLUMNAS_PERFIL}
     FROM usuarios u
     WHERE u.usuario_id = $1`,
    [usuarioId]
  );
  return resultado.rows[0] || null;
}

function formatearPerfil(fila, roles) {
  return {
    id: fila.usuario_id,
    nombres: fila.nombres,
    apellidos: fila.apellidos,
    correo: fila.correo,
    telefono: fila.telefono,
    nombre_usuario: fila.nombre_usuario,
    ultimo_acceso: fila.ultimo_acceso,
    creado_en: fila.creado_en,
    roles
  };
}

function textoOpcional(valor, maximo) {
  if (valor === undefined || valor === null) return null;
  const texto = String(valor).trim();
  if (!texto) return null;
  return texto.length > maximo ? undefined : texto;
}

// GET /api/auth/profile
export async function obtenerPerfil(req, res, next) {
  try {
    const fila = await leerPerfil(req.user.id);

    if (!fila) {
      return res.status(404).json({ ok: false, message: "Usuario no encontrado." });
    }

    res.json({ ok: true, usuario: formatearPerfil(fila, req.user.roles) });
  } catch (error) {
    next(error);
  }
}

// PUT /api/auth/profile
export async function actualizarPerfil(req, res, next) {
  try {
    const nombres = String(req.body.nombres ?? "").trim();
    const apellidos = textoOpcional(req.body.apellidos, 100);
    const correo = textoOpcional(req.body.correo, 150);
    const telefono = textoOpcional(req.body.telefono, 30);

    if (nombres.length < 2 || nombres.length > 100) {
      return res.status(400).json({
        ok: false,
        message: "El nombre debe tener entre 2 y 100 caracteres."
      });
    }

    if (apellidos === undefined) {
      return res.status(400).json({
        ok: false,
        message: "Los apellidos no pueden superar 100 caracteres."
      });
    }

    if (correo === undefined || (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))) {
      return res.status(400).json({
        ok: false,
        message: "Ingresa un correo válido."
      });
    }

    if (telefono === undefined || (telefono && !/^[0-9+()\s-]{6,30}$/.test(telefono))) {
      return res.status(400).json({
        ok: false,
        message: "Ingresa un teléfono válido."
      });
    }

    try {
      await query(
        `UPDATE usuarios
         SET nombres = $1,
             apellidos = $2,
             correo = $3,
             telefono = $4,
             actualizado_en = CURRENT_TIMESTAMP
         WHERE usuario_id = $5`,
        [nombres, apellidos, correo, telefono, req.user.id]
      );
    } catch (error) {
      // 23505: restricción de unicidad (correo ya usado por otra cuenta).
      if (error.code === "23505") {
        return res.status(409).json({
          ok: false,
          message: "Ese correo ya está registrado en otra cuenta."
        });
      }
      throw error;
    }

    const fila = await leerPerfil(req.user.id);

    res.json({
      ok: true,
      message: "Perfil actualizado correctamente.",
      usuario: formatearPerfil(fila, req.user.roles)
    });
  } catch (error) {
    next(error);
  }
}

// PUT /api/auth/password
export async function cambiarMiContrasena(req, res, next) {
  try {
    const { contrasena_actual, contrasena_nueva } = req.body;

    if (
      typeof contrasena_actual !== "string" ||
      !contrasena_actual ||
      contrasena_actual.length > 1024
    ) {
      return res.status(400).json({
        ok: false,
        message: "Ingresa tu contraseña actual."
      });
    }

    if (
      typeof contrasena_nueva !== "string" ||
      contrasena_nueva.length < 8 ||
      contrasena_nueva.length > 72
    ) {
      return res.status(400).json({
        ok: false,
        message: "La nueva contraseña debe tener entre 8 y 72 caracteres."
      });
    }

    if (contrasena_nueva === contrasena_actual) {
      return res.status(400).json({
        ok: false,
        message: "La nueva contraseña debe ser diferente a la actual."
      });
    }

    const resultado = await query(
      `SELECT contrasena_hash FROM usuarios WHERE usuario_id = $1`,
      [req.user.id]
    );

    const usuario = resultado.rows[0];

    if (!usuario) {
      return res.status(404).json({ ok: false, message: "Usuario no encontrado." });
    }

    const coincide = await bcrypt.compare(
      contrasena_actual,
      usuario.contrasena_hash
    );

    if (!coincide) {
      return res.status(400).json({
        ok: false,
        message: "La contraseña actual no es correcta."
      });
    }

    const hash = await bcrypt.hash(contrasena_nueva, 12);

    await query(
      `UPDATE usuarios
       SET contrasena_hash = $1,
           actualizado_en = CURRENT_TIMESTAMP
       WHERE usuario_id = $2`,
      [hash, req.user.id]
    );

    res.json({
      ok: true,
      message: "Contraseña actualizada correctamente."
    });
  } catch (error) {
    next(error);
  }
}
