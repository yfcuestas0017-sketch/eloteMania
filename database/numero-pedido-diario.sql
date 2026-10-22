-- Número de pedido que se reinicia cada día (1, 2, 3...).
-- Ejecutar UNA vez en la base de datos. Es seguro volver a ejecutarlo.
-- El código largo numero_pedido (P-2026...) se conserva como identificador interno.

ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS numero_dia integer;

-- Numera los pedidos anteriores por día (hora de Bogotá) según su orden de creación.
UPDATE pedidos p
SET numero_dia = t.n
FROM (
  SELECT pedido_id,
         ROW_NUMBER() OVER (
           PARTITION BY (fecha_pedido AT TIME ZONE 'America/Bogota')::date
           ORDER BY fecha_pedido, pedido_id
         ) AS n
  FROM pedidos
) t
WHERE p.pedido_id = t.pedido_id
  AND p.numero_dia IS NULL;

-- Un mismo número no puede repetirse en el mismo día.
CREATE UNIQUE INDEX IF NOT EXISTS ux_pedidos_numero_dia
  ON pedidos (((fecha_pedido AT TIME ZONE 'America/Bogota')::date), numero_dia);
