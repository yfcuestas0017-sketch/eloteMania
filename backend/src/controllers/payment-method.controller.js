import { query } from "../config/db.js";

export async function listarMetodosPago(req, res) {
  try {
    const resultado = await query(
      `SELECT metodo_pago_id, nombre
       FROM metodos_pago
       WHERE activo = TRUE
       ORDER BY nombre`
    );

    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      mensaje: "No se pudieron consultar los métodos de pago."
    });
  }
}

export async function crearMetodoPago(req, res) {
  try {
    const nombre = req.body.nombre?.trim();

    if (!nombre) {
      return res.status(400).json({
        mensaje: "El nombre del método de pago es obligatorio."
      });
    }

    const resultado = await query(
      `INSERT INTO metodos_pago (nombre, activo)
       VALUES ($1, TRUE)
       RETURNING metodo_pago_id, nombre, activo`,
      [nombre]
    );

    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      mensaje: "No se pudo crear el método de pago."
    });
  }
}