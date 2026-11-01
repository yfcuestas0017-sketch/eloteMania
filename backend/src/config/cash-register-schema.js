import { query } from "./db.js";

export async function initializeCashRegisterSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS cajas_turnos (
      turno_id BIGSERIAL PRIMARY KEY,
      cajero_id BIGINT NOT NULL REFERENCES usuarios(usuario_id) ON DELETE RESTRICT,
      fecha DATE NOT NULL,
      monto_apertura NUMERIC(12, 2) NOT NULL CHECK (monto_apertura >= 0),
      diferencia_apertura NUMERIC(12, 2) NOT NULL DEFAULT 0,
      observacion_apertura VARCHAR(500),
      efectivo_esperado_cierre NUMERIC(12, 2),
      efectivo_contado NUMERIC(12, 2),
      monto_dejado_caja NUMERIC(12, 2),
      diferencia_cierre NUMERIC(12, 2),
      observacion_cierre VARCHAR(500),
      abierta_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      cerrada_en TIMESTAMPTZ,
      UNIQUE (cajero_id, fecha)
    );
    ALTER TABLE cajas_turnos
      ADD COLUMN IF NOT EXISTS efectivo_esperado_cierre NUMERIC(12, 2);
    ALTER TABLE cajas_turnos
      ADD COLUMN IF NOT EXISTS monto_dejado_caja NUMERIC(12, 2);
    ALTER TABLE cajas_turnos
      ADD COLUMN IF NOT EXISTS diferencia_apertura NUMERIC(12, 2) NOT NULL DEFAULT 0;
    ALTER TABLE cajas_turnos
      ADD COLUMN IF NOT EXISTS observacion_apertura VARCHAR(500);
    ALTER TABLE cajas_turnos
      DROP CONSTRAINT IF EXISTS cajas_turnos_cajero_id_fecha_key;

    CREATE INDEX IF NOT EXISTS cajas_turnos_cajero_fecha_idx
      ON cajas_turnos (cajero_id, fecha DESC, turno_id DESC);

    CREATE TABLE IF NOT EXISTS caja_egresos (
      egreso_id BIGSERIAL PRIMARY KEY,
      turno_id BIGINT NOT NULL REFERENCES cajas_turnos(turno_id) ON DELETE RESTRICT,
      cajero_id BIGINT NOT NULL REFERENCES usuarios(usuario_id) ON DELETE RESTRICT,
      descripcion VARCHAR(250) NOT NULL,
      valor NUMERIC(12, 2) NOT NULL CHECK (valor > 0),
      creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS caja_egresos_turno_idx
      ON caja_egresos (turno_id, creado_en);

    CREATE TABLE IF NOT EXISTS conteos_inventario (
      conteo_id BIGSERIAL PRIMARY KEY,
      fecha DATE NOT NULL UNIQUE,
      cajero_id BIGINT NOT NULL REFERENCES usuarios(usuario_id) ON DELETE RESTRICT,
      creado_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conteo_inventario_detalle (
      detalle_id BIGSERIAL PRIMARY KEY,
      conteo_id BIGINT NOT NULL REFERENCES conteos_inventario(conteo_id) ON DELETE RESTRICT,
      producto_id BIGINT NOT NULL REFERENCES productos(producto_id) ON DELETE RESTRICT,
      stock_esperado NUMERIC(12, 2) NOT NULL,
      unidades_vendidas NUMERIC(12, 2) NOT NULL DEFAULT 0,
      cantidad_contada NUMERIC(12, 2) NOT NULL CHECK (cantidad_contada >= 0),
      diferencia NUMERIC(12, 2) NOT NULL,
      observacion VARCHAR(250),
      UNIQUE (conteo_id, producto_id)
    );
    ALTER TABLE conteo_inventario_detalle
      ADD COLUMN IF NOT EXISTS unidades_vendidas NUMERIC(12, 2) NOT NULL DEFAULT 0;
  `);
}
