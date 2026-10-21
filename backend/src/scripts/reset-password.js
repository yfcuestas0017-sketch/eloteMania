import "dotenv/config";
import bcrypt from "bcrypt";
import pool, { query } from "../config/db.js";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

// Uso interactivo:  npm run reset-password
// Uso directo:      npm run reset-password -- admin_user MiClaveNueva123
// Restablece la contraseña de un usuario existente guardando un hash bcrypt válido.
const rl = createInterface({ input: stdin, output: stdout });

try {
  const [argUsuario, argClave] = process.argv.slice(2);

  const nombreUsuario = (
    argUsuario ?? (await rl.question("Nombre de usuario: "))
  ).trim();

  const contrasena =
    argClave ?? (await rl.question("Nueva contraseña (mínimo 8 caracteres): "));

  if (!nombreUsuario || contrasena.length < 8) {
    throw new Error("Indica el usuario y una contraseña de al menos 8 caracteres.");
  }

  const hash = await bcrypt.hash(contrasena, 12);

  const resultado = await query(
    `UPDATE usuarios
     SET contrasena_hash = $1, activo = TRUE
     WHERE LOWER(nombre_usuario) = LOWER($2)
     RETURNING usuario_id, nombre_usuario`,
    [hash, nombreUsuario]
  );

  if (!resultado.rowCount) {
    throw new Error(`No existe el usuario "${nombreUsuario}".`);
  }

  console.log(`Contraseña actualizada para: ${resultado.rows[0].nombre_usuario}`);
} catch (error) {
  console.error("No se pudo restablecer la contraseña:", error.message);
  process.exitCode = 1;
} finally {
  rl.close();
  await pool.end();
}
