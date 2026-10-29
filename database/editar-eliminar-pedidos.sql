-- Edición y anulación de pedidos ya cobrados.
-- Ejecutar UNA vez en la base de datos (Neon / PostgreSQL). Es seguro volver a ejecutarlo.

-- 1. El checkout ya guarda la observación de cada línea en detalle_pedido.observaciones.
--    Esta columna no aparece en los scripts anteriores; si ya existe, no pasa nada.
ALTER TABLE detalle_pedido
  ADD COLUMN IF NOT EXISTS observaciones TEXT;

-- 2. Control de cuántas veces se modificó el comprobante de un pedido.
--    El comprobante conserva su mismo número; esto solo sirve para imprimir
--    "PEDIDO MODIFICADO" en el voucher y distinguirlo del original.
ALTER TABLE comprobantes
  ADD COLUMN IF NOT EXISTS cantidad_ediciones INTEGER NOT NULL DEFAULT 0;

ALTER TABLE comprobantes
  ADD COLUMN IF NOT EXISTS ultima_edicion TIMESTAMPTZ;

-- Nota: para anular un pedido NO se borra nada. Se usan las columnas que ya existían:
--   ventas.estado = 'anulada', pagos.estado = 'anulado',
--   pedidos.estado = 'cancelado' (+ cancelado_en, motivo_cancelacion)
-- y se registra el evento en la tabla auditoria. Todos los reportes ya filtran
-- por ventas.estado = 'vigente', así que un pedido anulado deja de sumar solo.
