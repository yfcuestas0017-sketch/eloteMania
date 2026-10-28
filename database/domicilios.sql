-- Ejecutar en la base de datos EloteMania (Neon / PostgreSQL).
-- Agrega soporte para pedidos a domicilio.
-- Es totalmente seguro volver a ejecutar (idempotente).

-- 1. Columnas en la tabla pedidos para el domicilio
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS tipo_pedido VARCHAR(20) NOT NULL DEFAULT 'local';

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS direccion_domicilio VARCHAR(250);

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS barrio_domicilio VARCHAR(150);

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS telefono_domicilio VARCHAR(30);

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS nombre_cliente_domicilio VARCHAR(150);

ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS costo_domicilio NUMERIC(12, 2) NOT NULL DEFAULT 0;

-- Restricción: tipo solo puede ser 'local' o 'domicilio'.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_pedido_tipo'
  ) THEN
    ALTER TABLE pedidos
      ADD CONSTRAINT chk_pedido_tipo
      CHECK (tipo_pedido IN ('local', 'domicilio'));
  END IF;
END $$;

-- Restricción: costo_domicilio no puede ser negativo.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_pedido_costo_domicilio'
  ) THEN
    ALTER TABLE pedidos
      ADD CONSTRAINT chk_pedido_costo_domicilio
      CHECK (costo_domicilio >= 0);
  END IF;
END $$;

-- Índice para filtrar pedidos por tipo.
CREATE INDEX IF NOT EXISTS idx_pedidos_tipo
  ON pedidos (tipo_pedido);

-- 2. Función confirmar_venta actualizada para incluir costo_domicilio en el total cobrado.
CREATE OR REPLACE FUNCTION public.confirmar_venta(
  p_pedido_id bigint,
  p_metodo_pago_id bigint,
  p_valor_pago numeric,
  p_usuario_id bigint
)
RETURNS TABLE(
  resultado_pedido_id bigint,
  resultado_venta_id bigint,
  resultado_comprobante_id bigint,
  resultado_total numeric,
  resultado_numero_comprobante character varying
)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_pedido pedidos%ROWTYPE;
  v_producto productos%ROWTYPE;
  v_venta_id BIGINT;
  v_comprobante_id BIGINT;
  v_total NUMERIC(12,2);
  v_subtotal NUMERIC(12,2);
  v_descuento NUMERIC(12,2);
  v_impuesto NUMERIC(12,2);
  v_costo_domicilio NUMERIC(12,2);
  v_numero_venta VARCHAR(30);
  v_numero_comprobante VARCHAR(40);
  v_detalle RECORD;
BEGIN
  SELECT *
  INTO v_pedido
  FROM pedidos
  WHERE pedido_id = p_pedido_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'El pedido % no existe.', p_pedido_id;
  END IF;

  IF v_pedido.estado <> 'pendiente' THEN
    RAISE EXCEPTION
      'El pedido no se puede confirmar. Estado actual: %.',
      v_pedido.estado;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM detalle_pedido
    WHERE pedido_id = p_pedido_id
  ) AND NOT EXISTS (
    SELECT 1
    FROM pedido_adicionales
    WHERE pedido_id = p_pedido_id
  ) THEN
    RAISE EXCEPTION 'No se puede vender un pedido vacío.';
  END IF;

  IF p_valor_pago IS NULL OR p_valor_pago <= 0 THEN
    RAISE EXCEPTION 'El valor del pago debe ser mayor que cero.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM usuarios u
    JOIN usuario_roles ur ON ur.usuario_id = u.usuario_id
    JOIN roles r ON r.rol_id = ur.rol_id
    WHERE u.usuario_id = p_usuario_id
      AND u.activo = TRUE
      AND r.nombre IN ('ADMIN', 'CAJERO')
      AND r.activo = TRUE
  ) THEN
    RAISE EXCEPTION
      'El usuario no está habilitado para registrar ventas.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM metodos_pago
    WHERE metodo_pago_id = p_metodo_pago_id
      AND activo = TRUE
  ) THEN
    RAISE EXCEPTION 'El método de pago no existe o está inactivo.';
  END IF;

  -- Costo de domicilio del pedido (0 si es local).
  v_costo_domicilio := COALESCE(v_pedido.costo_domicilio, 0);

  SELECT
    COALESCE(SUM(dp.cantidad * dp.precio_unitario), 0)
      + COALESCE((
          SELECT SUM(pa.total_linea)
          FROM pedido_adicionales pa
          WHERE pa.pedido_id = p_pedido_id
        ), 0),
    COALESCE(SUM(dp.descuento), 0),
    COALESCE(SUM(dp.impuesto), 0),
    COALESCE(SUM(dp.total_linea), 0)
      + COALESCE((
          SELECT SUM(pa.total_linea)
          FROM pedido_adicionales pa
          WHERE pa.pedido_id = p_pedido_id
        ), 0)
      + v_costo_domicilio
  INTO v_subtotal, v_descuento, v_impuesto, v_total
  FROM detalle_pedido dp
  WHERE dp.pedido_id = p_pedido_id;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'El total de la venta debe ser mayor que cero.';
  END IF;

  IF v_descuento > v_subtotal THEN
    RAISE EXCEPTION 'El descuento supera el subtotal.';
  END IF;

  IF ROUND(v_subtotal - v_descuento + v_impuesto + v_costo_domicilio, 2)
     <> ROUND(v_total, 2) THEN
    RAISE EXCEPTION
      'Los totales de los detalles no coinciden. Revise los importes.';
  END IF;

  IF ROUND(p_valor_pago, 2) <> ROUND(v_total, 2) THEN
    RAISE EXCEPTION
      'El pago (%) debe coincidir con el total (%).',
      p_valor_pago, v_total;
  END IF;

  FOR v_detalle IN
    SELECT DISTINCT dp.producto_id
    FROM detalle_pedido dp
    WHERE dp.pedido_id = p_pedido_id
      AND dp.producto_id IS NOT NULL
    ORDER BY dp.producto_id
  LOOP
    SELECT *
    INTO v_producto
    FROM productos
    WHERE producto_id = v_detalle.producto_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Uno de los productos del pedido ya no existe.';
    END IF;

    IF v_producto.eliminado_en IS NOT NULL
       OR NOT v_producto.disponible THEN
      RAISE EXCEPTION
        'El producto "%" no está disponible.',
        v_producto.nombre;
    END IF;
  END LOOP;

  FOR v_detalle IN
    SELECT
      dp.producto_id,
      SUM(dp.cantidad) AS cantidad_total
    FROM detalle_pedido dp
    WHERE dp.pedido_id = p_pedido_id
      AND dp.producto_id IS NOT NULL
    GROUP BY dp.producto_id
    ORDER BY dp.producto_id
  LOOP
    SELECT *
    INTO v_producto
    FROM productos
    WHERE producto_id = v_detalle.producto_id;

    IF v_producto.controla_inventario THEN
      IF v_producto.stock_actual < v_detalle.cantidad_total THEN
        RAISE EXCEPTION
          'Stock insuficiente para "%". Disponible: %, solicitado: %.',
          v_producto.nombre,
          v_producto.stock_actual,
          v_detalle.cantidad_total;
      END IF;

      UPDATE productos
      SET stock_actual = stock_actual - v_detalle.cantidad_total
      WHERE producto_id = v_detalle.producto_id;

      INSERT INTO movimientos_inventario (
        producto_id,
        usuario_id,
        pedido_id,
        tipo,
        cantidad,
        stock_anterior,
        stock_nuevo,
        motivo
      )
      VALUES (
        v_producto.producto_id,
        p_usuario_id,
        p_pedido_id,
        'salida',
        v_detalle.cantidad_total,
        v_producto.stock_actual,
        v_producto.stock_actual - v_detalle.cantidad_total,
        'Venta confirmada'
      );
    END IF;
  END LOOP;

  v_numero_venta :=
    'V-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDDHH24MISS')
    || '-' || p_pedido_id;

  INSERT INTO ventas (
    pedido_id,
    numero_venta,
    cajero_id,
    subtotal,
    descuento,
    impuesto,
    total,
    estado
  )
  VALUES (
    p_pedido_id,
    v_numero_venta,
    p_usuario_id,
    v_subtotal,
    v_descuento,
    v_impuesto,
    v_total,
    'vigente'
  )
  RETURNING venta_id INTO v_venta_id;

  INSERT INTO pagos (
    pedido_id,
    metodo_pago_id,
    registrado_por,
    valor,
    estado
  )
  VALUES (
    p_pedido_id,
    p_metodo_pago_id,
    p_usuario_id,
    v_total,
    'confirmado'
  );

  v_numero_comprobante :=
    'B-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDDHH24MISS')
    || '-' || p_pedido_id;

  INSERT INTO comprobantes (
    pedido_id,
    venta_id,
    numero_comprobante
  )
  VALUES (
    p_pedido_id,
    v_venta_id,
    v_numero_comprobante
  )
  RETURNING comprobante_id INTO v_comprobante_id;

  UPDATE pedidos
  SET estado = 'completado',
      subtotal = v_subtotal,
      descuento = v_descuento,
      impuesto = v_impuesto,
      total = v_total,
      completado_en = CURRENT_TIMESTAMP
  WHERE pedido_id = p_pedido_id;

  INSERT INTO auditoria (
    usuario_id,
    accion,
    tabla_afectada,
    registro_id,
    descripcion
  )
  VALUES (
    p_usuario_id,
    'CONFIRMAR_VENTA',
    'pedidos',
    p_pedido_id,
    'Venta ' || v_numero_venta
      || ' confirmada por valor de ' || v_total
  );

  RETURN QUERY
  SELECT
    p_pedido_id,
    v_venta_id,
    v_comprobante_id,
    v_total,
    v_numero_comprobante;
END;
$function$;
