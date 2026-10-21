
import "dotenv/config";
import bcrypt from "bcrypt";
import { getClient } from "../config/db.js";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const rl = createInterface({ input: stdin, output: stdout });
const client = await getClient();

try {
  const nombres = (await rl.question("Nombres del administrador: ")).trim();
  const apellidos = (await rl.question("Apellidos: ")).trim();
  const nombreUsuario = (
    await rl.question("Nombre de usuario: ")
  ).trim();

  const contrasena = await rl.question("Contraseña: ");

  if (!nombres || !nombreUsuario || contrasena.length < 12) {
    throw new Error(
      "Los nombres y el usuario son obligatorios. Usa una contraseña de al menos 12 caracteres."
    );
  }

  await client.query("BEGIN");

  const existente = await client.query(
    `SELECT 1 FROM usuarios
     WHERE LOWER(nombre_usuario) = LOWER($1)`,
    [nombreUsuario]
  );

  if (existente.rowCount > 0) {
    throw new Error("Ese nombre de usuario ya está registrado.");
  }

  const hash = await bcrypt.hash(contrasena, 12);

  const creado = await client.query(
    `INSERT INTO usuarios (
       nombres, apellidos, nombre_usuario, contrasena_hash
     )
     VALUES ($1, $2, $3, $4)
     RETURNING usuario_id, nombre_usuario`,
    [nombres, apellidos || null, nombreUsuario, hash]
  );

  const administrador = await client.query(
    `SELECT rol_id FROM roles
     WHERE nombre = 'ADMIN' AND activo = TRUE`
  );

  if (!administrador.rowCount) {
    throw new Error("No existe el rol ADMIN. Ejecuta primero el SQL inicial.");
  }

  await client.query(
    `INSERT INTO usuario_roles (usuario_id, rol_id)
     VALUES ($1, $2)`,
    [creado.rows[0].usuario_id, administrador.rows[0].rol_id]
  );

  await client.query("COMMIT");

  console.log("Administrador creado correctamente.");
  console.log("Usuario:", creado.rows[0].nombre_usuario);
} catch (error) {
  await client.query("ROLLBACK");
  console.error("No se pudo crear el administrador:", error.message);
  process.exitCode = 1;
} finally {
  client.release();
  rl.close();
  await (await import("../config/db.js")).default.end();
}
