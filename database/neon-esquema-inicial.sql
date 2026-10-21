-- EloteMania: esquema + datos base (roles y métodos de pago) + tablas de adicionales.
-- Listo para pegar en el SQL Editor de Neon o ejecutar con psql. NO incluye usuarios:
-- crea el administrador con:  npm run crear-admin  (carpeta backend).

--
-- PostgreSQL database dump
--

\restrict LRHEJxc7RRgIYWtQOEdMCKrJ8q1sqnYu7HSpxBX67MzruNJfVbX33DZQ1gaaJRY

-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: actualizar_fecha_modificacion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.actualizar_fecha_modificacion() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.actualizado_en = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: confirmar_venta(bigint, bigint, numeric, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirmar_venta(p_pedido_id bigint, p_metodo_pago_id bigint, p_valor_pago numeric, p_usuario_id bigint) RETURNS TABLE(resultado_pedido_id bigint, resultado_venta_id bigint, resultado_comprobante_id bigint, resultado_total numeric, resultado_numero_comprobante character varying)
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_pedido pedidos%ROWTYPE;
  v_producto productos%ROWTYPE;
  v_venta_id BIGINT;
  v_comprobante_id BIGINT;
  v_total NUMERIC(12,2);
  v_subtotal NUMERIC(12,2);
  v_descuento NUMERIC(12,2);
  v_impuesto NUMERIC(12,2);
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
  INTO v_subtotal, v_descuento, v_impuesto, v_total
  FROM detalle_pedido dp
  WHERE dp.pedido_id = p_pedido_id;

  IF v_total <= 0 THEN
    RAISE EXCEPTION 'El total de la venta debe ser mayor que cero.';
  END IF;

  IF v_descuento > v_subtotal THEN
    RAISE EXCEPTION 'El descuento supera el subtotal.';
  END IF;

  IF ROUND(v_subtotal - v_descuento + v_impuesto, 2)
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
$$;


--
-- Name: entregar_pedido(character varying, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.entregar_pedido(p_numero_comprobante character varying, p_usuario_id bigint) RETURNS bigint
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_pedido_id BIGINT;
    v_estado VARCHAR(25);
    v_estado_entrega VARCHAR(25);
BEGIN
    -- Verificar permisos del usuario que realiza la entrega.
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
        RAISE EXCEPTION 'Usuario no autorizado.';
    END IF;

    SELECT p.pedido_id, p.estado, p.estado_entrega
    INTO v_pedido_id, v_estado, v_estado_entrega
    FROM comprobantes c
    JOIN pedidos p ON p.pedido_id = c.pedido_id
    WHERE c.numero_comprobante = p_numero_comprobante
    FOR UPDATE OF p;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El comprobante no existe.';
    END IF;

    IF v_estado <> 'completado' THEN
        RAISE EXCEPTION
            'El pedido no tiene una venta completada.';
    END IF;

    IF v_estado_entrega = 'entregado' THEN
        RAISE EXCEPTION
            'Este pedido ya fue entregado.';
    END IF;

    UPDATE pedidos
    SET estado_entrega = 'entregado'
    WHERE pedido_id = v_pedido_id;

    INSERT INTO auditoria (
        usuario_id,
        accion,
        tabla_afectada,
        registro_id,
        descripcion
    )
    VALUES (
        p_usuario_id,
        'ENTREGAR_PEDIDO',
        'pedidos',
        v_pedido_id,
        'Entrega registrada mediante comprobante '
        || p_numero_comprobante
    );

    RETURN v_pedido_id;
END;
$$;


--
-- Name: registrar_impresion(bigint, bigint); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_impresion(p_comprobante_id bigint, p_usuario_id bigint) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_impresiones INTEGER;
    v_estado_venta VARCHAR(20);
BEGIN
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
        RAISE EXCEPTION 'Usuario no autorizado.';
    END IF;

    -- Bloquear el comprobante para contar impresiones correctamente.
    SELECT v.estado
    INTO v_estado_venta
    FROM comprobantes c
    JOIN ventas v ON v.venta_id = c.venta_id
    WHERE c.comprobante_id = p_comprobante_id
    FOR UPDATE OF c;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Comprobante no encontrado.';
    END IF;

    IF v_estado_venta <> 'vigente' THEN
        RAISE EXCEPTION
            'No se puede imprimir un comprobante de una venta anulada.';
    END IF;

    SELECT cantidad_impresiones
    INTO v_impresiones
    FROM comprobantes
    WHERE comprobante_id = p_comprobante_id;

    INSERT INTO comprobante_impresiones (
        comprobante_id,
        usuario_id,
        tipo
    )
    VALUES (
        p_comprobante_id,
        p_usuario_id,
        CASE
            WHEN v_impresiones = 0 THEN 'original'
            ELSE 'reimpresion'
        END
    );

    UPDATE comprobantes
    SET cantidad_impresiones = cantidad_impresiones + 1,
        ultima_impresion = CURRENT_TIMESTAMP
    WHERE comprobante_id = p_comprobante_id
    RETURNING cantidad_impresiones INTO v_impresiones;

    RETURN v_impresiones;
END;
$$;


--
-- Name: registrar_movimiento_inventario(integer, character varying, numeric, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_movimiento_inventario(p_producto_id integer, p_tipo character varying, p_cantidad numeric, p_motivo text, p_usuario_id integer) RETURNS TABLE(producto_id integer, stock_anterior numeric, stock_nuevo numeric, movimiento_id integer)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_stock_anterior NUMERIC;
    v_stock_nuevo NUMERIC;
    v_movimiento_id INTEGER;
BEGIN
    IF p_tipo NOT IN ('entrada', 'salida', 'merma', 'ajuste') THEN
        RAISE EXCEPTION 'Tipo de movimiento no válido';
    END IF;

    IF p_cantidad IS NULL OR p_cantidad < 0 THEN
        RAISE EXCEPTION 'La cantidad no puede ser negativa';
    END IF;

    IF p_motivo IS NULL OR LENGTH(TRIM(p_motivo)) = 0 THEN
        RAISE EXCEPTION 'Debes indicar el motivo del movimiento';
    END IF;

    SELECT p.stock_actual
    INTO v_stock_anterior
    FROM productos p
    WHERE p.producto_id = p_producto_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'El producto no existe';
    END IF;

    CASE p_tipo
        WHEN 'entrada' THEN
            v_stock_nuevo := v_stock_anterior + p_cantidad;

        WHEN 'salida' THEN
            IF p_cantidad > v_stock_anterior THEN
                RAISE EXCEPTION 'Stock insuficiente';
            END IF;
            v_stock_nuevo := v_stock_anterior - p_cantidad;

        WHEN 'merma' THEN
            IF p_cantidad > v_stock_anterior THEN
                RAISE EXCEPTION 'La merma supera el stock disponible';
            END IF;
            v_stock_nuevo := v_stock_anterior - p_cantidad;

        WHEN 'ajuste' THEN
            v_stock_nuevo := p_cantidad;
    END CASE;

    UPDATE productos
    SET stock_actual = v_stock_nuevo
    WHERE productos.producto_id = p_producto_id;

    INSERT INTO movimientos_inventario (
        producto_id,
        tipo,
        cantidad,
        motivo,
        usuario_id,
        fecha
    )
    VALUES (
        p_producto_id,
        p_tipo,
        CASE
            WHEN p_tipo = 'ajuste'
                THEN ABS(v_stock_nuevo - v_stock_anterior)
            ELSE p_cantidad
        END,
        p_motivo,
        p_usuario_id,
        NOW()
    )
    RETURNING movimientos_inventario.movimiento_id
    INTO v_movimiento_id;

    RETURN QUERY
    SELECT
        p_producto_id,
        v_stock_anterior,
        v_stock_nuevo,
        v_movimiento_id;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: adicionales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adicionales (
    adicional_id bigint NOT NULL,
    producto_id bigint NOT NULL,
    nombre character varying(100) NOT NULL,
    precio numeric(12,2) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT adicionales_precio_check CHECK ((precio >= (0)::numeric))
);


--
-- Name: adicionales_adicional_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.adicionales ALTER COLUMN adicional_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.adicionales_adicional_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: adicionales_productos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.adicionales_productos (
    adicional_id bigint NOT NULL,
    producto_id bigint NOT NULL
);


--
-- Name: auditoria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auditoria (
    auditoria_id bigint NOT NULL,
    usuario_id bigint,
    accion character varying(100) NOT NULL,
    tabla_afectada character varying(100),
    registro_id bigint,
    descripcion text,
    direccion_ip inet,
    fecha_evento timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: auditoria_auditoria_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.auditoria ALTER COLUMN auditoria_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.auditoria_auditoria_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: categorias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.categorias (
    categoria_id bigint NOT NULL,
    nombre character varying(100) NOT NULL,
    descripcion text,
    imagen_url text,
    activa boolean DEFAULT true NOT NULL,
    orden_visualizacion integer DEFAULT 0 NOT NULL,
    creado_en timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: categorias_categoria_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.categorias ALTER COLUMN categoria_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.categorias_categoria_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: comprobante_impresiones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comprobante_impresiones (
    impresion_id bigint NOT NULL,
    comprobante_id bigint NOT NULL,
    usuario_id bigint NOT NULL,
    fecha_impresion timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    tipo character varying(20) DEFAULT 'original'::character varying NOT NULL,
    CONSTRAINT chk_impresion_tipo CHECK (((tipo)::text = ANY (ARRAY[('original'::character varying)::text, ('reimpresion'::character varying)::text])))
);


--
-- Name: comprobante_impresiones_impresion_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.comprobante_impresiones ALTER COLUMN impresion_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.comprobante_impresiones_impresion_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: comprobantes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comprobantes (
    comprobante_id bigint NOT NULL,
    pedido_id bigint NOT NULL,
    venta_id bigint NOT NULL,
    codigo_verificacion uuid DEFAULT gen_random_uuid() NOT NULL,
    numero_comprobante character varying(40) NOT NULL,
    fecha_emision timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    cantidad_impresiones integer DEFAULT 0 NOT NULL,
    ultima_impresion timestamp with time zone,
    CONSTRAINT chk_comprobante_impresiones CHECK ((cantidad_impresiones >= 0))
);


--
-- Name: comprobantes_comprobante_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.comprobantes ALTER COLUMN comprobante_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.comprobantes_comprobante_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: detalle_pedido; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.detalle_pedido (
    detalle_id bigint NOT NULL,
    pedido_id bigint NOT NULL,
    producto_id bigint,
    nombre_producto character varying(150) NOT NULL,
    codigo_producto character varying(50),
    cantidad numeric(12,3) NOT NULL,
    precio_unitario numeric(12,2) NOT NULL,
    descuento numeric(12,2) DEFAULT 0 NOT NULL,
    impuesto numeric(12,2) DEFAULT 0 NOT NULL,
    total_linea numeric(12,2) NOT NULL,
    CONSTRAINT chk_detalle_cantidad CHECK ((cantidad > (0)::numeric)),
    CONSTRAINT chk_detalle_descuento CHECK ((descuento >= (0)::numeric)),
    CONSTRAINT chk_detalle_impuesto CHECK ((impuesto >= (0)::numeric)),
    CONSTRAINT chk_detalle_precio CHECK ((precio_unitario >= (0)::numeric)),
    CONSTRAINT chk_detalle_total CHECK ((total_linea >= (0)::numeric))
);


--
-- Name: detalle_pedido_adicionales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.detalle_pedido_adicionales (
    detalle_pedido_adicional_id bigint NOT NULL,
    detalle_id bigint NOT NULL,
    adicional_id bigint,
    nombre_adicional character varying(100) NOT NULL,
    precio_unitario numeric(12,2) NOT NULL,
    cantidad integer NOT NULL,
    total_linea numeric(12,2) NOT NULL,
    CONSTRAINT detalle_pedido_adicionales_cantidad_check CHECK ((cantidad > 0)),
    CONSTRAINT detalle_pedido_adicionales_precio_unitario_check CHECK ((precio_unitario >= (0)::numeric)),
    CONSTRAINT detalle_pedido_adicionales_total_linea_check CHECK ((total_linea >= (0)::numeric))
);


--
-- Name: detalle_pedido_adicionales_detalle_pedido_adicional_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.detalle_pedido_adicionales ALTER COLUMN detalle_pedido_adicional_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.detalle_pedido_adicionales_detalle_pedido_adicional_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: detalle_pedido_detalle_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.detalle_pedido ALTER COLUMN detalle_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.detalle_pedido_detalle_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: metodos_pago; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.metodos_pago (
    metodo_pago_id bigint NOT NULL,
    nombre character varying(50) NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: metodos_pago_metodo_pago_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.metodos_pago ALTER COLUMN metodo_pago_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.metodos_pago_metodo_pago_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: movimientos_inventario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.movimientos_inventario (
    movimiento_id bigint NOT NULL,
    producto_id bigint NOT NULL,
    usuario_id bigint NOT NULL,
    pedido_id bigint,
    tipo character varying(20) NOT NULL,
    cantidad numeric(12,3) NOT NULL,
    stock_anterior numeric(12,3),
    stock_nuevo numeric(12,3),
    motivo text,
    fecha_movimiento timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_movimiento_cantidad CHECK ((cantidad > (0)::numeric)),
    CONSTRAINT chk_movimiento_tipo CHECK (((tipo)::text = ANY (ARRAY[('entrada'::character varying)::text, ('salida'::character varying)::text, ('ajuste'::character varying)::text, ('merma'::character varying)::text, ('devolucion'::character varying)::text])))
);


--
-- Name: movimientos_inventario_movimiento_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.movimientos_inventario ALTER COLUMN movimiento_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.movimientos_inventario_movimiento_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: pagos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagos (
    pago_id bigint NOT NULL,
    pedido_id bigint NOT NULL,
    metodo_pago_id bigint NOT NULL,
    registrado_por bigint NOT NULL,
    fecha_pago timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    valor numeric(12,2) NOT NULL,
    referencia_pago character varying(150),
    estado character varying(20) DEFAULT 'confirmado'::character varying NOT NULL,
    observaciones text,
    CONSTRAINT chk_pago_estado CHECK (((estado)::text = ANY (ARRAY[('confirmado'::character varying)::text, ('anulado'::character varying)::text]))),
    CONSTRAINT chk_pago_valor CHECK ((valor > (0)::numeric))
);


--
-- Name: pagos_pago_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.pagos ALTER COLUMN pago_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.pagos_pago_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: pedido_adicionales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedido_adicionales (
    pedido_adicional_id bigint NOT NULL,
    pedido_id bigint NOT NULL,
    adicional_id bigint,
    nombre_adicional character varying(100) NOT NULL,
    precio_unitario numeric(12,2) NOT NULL,
    cantidad integer NOT NULL,
    total_linea numeric(12,2) NOT NULL,
    CONSTRAINT pedido_adicionales_cantidad_check CHECK ((cantidad > 0)),
    CONSTRAINT pedido_adicionales_precio_unitario_check CHECK ((precio_unitario >= (0)::numeric)),
    CONSTRAINT pedido_adicionales_total_linea_check CHECK ((total_linea >= (0)::numeric))
);


--
-- Name: pedido_adicionales_pedido_adicional_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.pedido_adicionales ALTER COLUMN pedido_adicional_id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.pedido_adicionales_pedido_adicional_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: pedidos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedidos (
    pedido_id bigint NOT NULL,
    numero_pedido character varying(30) NOT NULL,
    cajero_id bigint NOT NULL,
    cliente_id bigint,
    fecha_pedido timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    estado character varying(25) DEFAULT 'pendiente'::character varying NOT NULL,
    estado_entrega character varying(25) DEFAULT 'pendiente'::character varying NOT NULL,
    subtotal numeric(12,2) DEFAULT 0 NOT NULL,
    descuento numeric(12,2) DEFAULT 0 NOT NULL,
    impuesto numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) DEFAULT 0 NOT NULL,
    observaciones text,
    completado_en timestamp with time zone,
    cancelado_en timestamp with time zone,
    motivo_cancelacion text,
    CONSTRAINT chk_pedido_descuento CHECK ((descuento <= subtotal)),
    CONSTRAINT chk_pedido_entrega CHECK (((estado_entrega)::text = ANY (ARRAY[('pendiente'::character varying)::text, ('entregado'::character varying)::text]))),
    CONSTRAINT chk_pedido_estado CHECK (((estado)::text = ANY (ARRAY[('pendiente'::character varying)::text, ('completado'::character varying)::text, ('cancelado'::character varying)::text]))),
    CONSTRAINT chk_pedido_importes CHECK (((subtotal >= (0)::numeric) AND (descuento >= (0)::numeric) AND (impuesto >= (0)::numeric) AND (total >= (0)::numeric)))
);


--
-- Name: pedidos_pedido_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.pedidos ALTER COLUMN pedido_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.pedidos_pedido_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: productos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.productos (
    producto_id bigint NOT NULL,
    categoria_id bigint,
    codigo character varying(50),
    nombre character varying(150) NOT NULL,
    descripcion text,
    imagen_url text,
    precio numeric(12,2) NOT NULL,
    controla_inventario boolean DEFAULT false NOT NULL,
    stock_actual numeric(12,3) DEFAULT 0 NOT NULL,
    stock_minimo numeric(12,3) DEFAULT 0 NOT NULL,
    unidad_medida character varying(20) DEFAULT 'unidad'::character varying NOT NULL,
    disponible boolean DEFAULT true NOT NULL,
    eliminado_en timestamp with time zone,
    creado_en timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_producto_precio CHECK ((precio >= (0)::numeric)),
    CONSTRAINT chk_producto_stock CHECK ((stock_actual >= (0)::numeric)),
    CONSTRAINT chk_producto_stock_minimo CHECK ((stock_minimo >= (0)::numeric))
);


--
-- Name: productos_producto_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.productos ALTER COLUMN producto_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.productos_producto_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    rol_id bigint NOT NULL,
    nombre character varying(30) NOT NULL,
    descripcion text,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT chk_roles_nombre CHECK (((nombre)::text = ANY (ARRAY[('ADMIN'::character varying)::text, ('CAJERO'::character varying)::text, ('CLIENTE'::character varying)::text])))
);


--
-- Name: roles_rol_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.roles ALTER COLUMN rol_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.roles_rol_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: usuario_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuario_roles (
    usuario_id bigint NOT NULL,
    rol_id bigint NOT NULL,
    asignado_en timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    usuario_id bigint NOT NULL,
    nombres character varying(100) NOT NULL,
    apellidos character varying(100),
    tipo_documento character varying(20),
    numero_documento character varying(30),
    correo character varying(150),
    telefono character varying(30),
    nombre_usuario character varying(50) NOT NULL,
    contrasena_hash text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    ultimo_acceso timestamp with time zone,
    creado_en timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    actualizado_en timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: usuarios_usuario_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.usuarios ALTER COLUMN usuario_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.usuarios_usuario_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ventas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ventas (
    venta_id bigint NOT NULL,
    pedido_id bigint NOT NULL,
    numero_venta character varying(30) NOT NULL,
    cajero_id bigint NOT NULL,
    fecha_venta timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    descuento numeric(12,2) DEFAULT 0 NOT NULL,
    impuesto numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) NOT NULL,
    estado character varying(20) DEFAULT 'vigente'::character varying NOT NULL,
    CONSTRAINT chk_venta_estado CHECK (((estado)::text = ANY (ARRAY[('vigente'::character varying)::text, ('anulada'::character varying)::text]))),
    CONSTRAINT chk_venta_total CHECK (((subtotal >= (0)::numeric) AND (descuento >= (0)::numeric) AND (impuesto >= (0)::numeric) AND (total >= (0)::numeric)))
);


--
-- Name: ventas_venta_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.ventas ALTER COLUMN venta_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.ventas_venta_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Data for Name: adicionales; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.adicionales (adicional_id, producto_id, nombre, precio, activo, creado_en) FROM stdin;
\.


--
-- Data for Name: adicionales_productos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.adicionales_productos (adicional_id, producto_id) FROM stdin;
\.


--
-- Data for Name: auditoria; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.auditoria (auditoria_id, usuario_id, accion, tabla_afectada, registro_id, descripcion, direccion_ip, fecha_evento) FROM stdin;
\.


--
-- Data for Name: categorias; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.categorias (categoria_id, nombre, descripcion, imagen_url, activa, orden_visualizacion, creado_en) FROM stdin;
\.


--
-- Data for Name: comprobante_impresiones; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.comprobante_impresiones (impresion_id, comprobante_id, usuario_id, fecha_impresion, tipo) FROM stdin;
\.


--
-- Data for Name: comprobantes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.comprobantes (comprobante_id, pedido_id, venta_id, codigo_verificacion, numero_comprobante, fecha_emision, cantidad_impresiones, ultima_impresion) FROM stdin;
\.


--
-- Data for Name: detalle_pedido; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.detalle_pedido (detalle_id, pedido_id, producto_id, nombre_producto, codigo_producto, cantidad, precio_unitario, descuento, impuesto, total_linea) FROM stdin;
\.


--
-- Data for Name: detalle_pedido_adicionales; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.detalle_pedido_adicionales (detalle_pedido_adicional_id, detalle_id, adicional_id, nombre_adicional, precio_unitario, cantidad, total_linea) FROM stdin;
\.


--
-- Data for Name: metodos_pago; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.metodos_pago (metodo_pago_id, nombre, activo, creado_en) FROM stdin;
1	Efectivo	t	2026-10-12 17:32:49.012824+00
2	Nequi	t	2026-10-12 17:32:49.012824+00
3	Transferencia	t	2026-10-12 17:32:49.012824+00
4	Tarjeta débito	t	2026-10-12 17:32:49.012824+00
5	Tarjeta crédito	t	2026-10-12 17:32:49.012824+00
\.


--
-- Data for Name: movimientos_inventario; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.movimientos_inventario (movimiento_id, producto_id, usuario_id, pedido_id, tipo, cantidad, stock_anterior, stock_nuevo, motivo, fecha_movimiento) FROM stdin;
\.


--
-- Data for Name: pagos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pagos (pago_id, pedido_id, metodo_pago_id, registrado_por, fecha_pago, valor, referencia_pago, estado, observaciones) FROM stdin;
\.


--
-- Data for Name: pedido_adicionales; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pedido_adicionales (pedido_adicional_id, pedido_id, adicional_id, nombre_adicional, precio_unitario, cantidad, total_linea) FROM stdin;
\.


--
-- Data for Name: pedidos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.pedidos (pedido_id, numero_pedido, cajero_id, cliente_id, fecha_pedido, estado, estado_entrega, subtotal, descuento, impuesto, total, observaciones, completado_en, cancelado_en, motivo_cancelacion) FROM stdin;
\.


--
-- Data for Name: productos; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.productos (producto_id, categoria_id, codigo, nombre, descripcion, imagen_url, precio, controla_inventario, stock_actual, stock_minimo, unidad_medida, disponible, eliminado_en, creado_en, actualizado_en) FROM stdin;
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.roles (rol_id, nombre, descripcion, activo, creado_en) FROM stdin;
1	ADMIN	Acceso administrativo al sistema	t	2026-10-12 17:32:49.012824+00
2	CAJERO	Registro de pedidos y cobros	t	2026-10-12 17:32:49.012824+00
3	CLIENTE	Consulta pública del menú	t	2026-10-12 17:32:49.012824+00
\.


--
-- Data for Name: usuario_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.usuario_roles (usuario_id, rol_id, asignado_en) FROM stdin;
\.


--
-- Data for Name: usuarios; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.usuarios (usuario_id, nombres, apellidos, tipo_documento, numero_documento, correo, telefono, nombre_usuario, contrasena_hash, activo, ultimo_acceso, creado_en, actualizado_en) FROM stdin;
\.


--
-- Data for Name: ventas; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ventas (venta_id, pedido_id, numero_venta, cajero_id, fecha_venta, subtotal, descuento, impuesto, total, estado) FROM stdin;
\.


--
-- Name: adicionales_adicional_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.adicionales_adicional_id_seq', 1, false);


--
-- Name: auditoria_auditoria_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.auditoria_auditoria_id_seq', 1, false);


--
-- Name: categorias_categoria_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.categorias_categoria_id_seq', 1, false);


--
-- Name: comprobante_impresiones_impresion_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.comprobante_impresiones_impresion_id_seq', 1, false);


--
-- Name: comprobantes_comprobante_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.comprobantes_comprobante_id_seq', 1, false);


--
-- Name: detalle_pedido_adicionales_detalle_pedido_adicional_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.detalle_pedido_adicionales_detalle_pedido_adicional_id_seq', 1, false);


--
-- Name: detalle_pedido_detalle_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.detalle_pedido_detalle_id_seq', 1, false);


--
-- Name: metodos_pago_metodo_pago_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.metodos_pago_metodo_pago_id_seq', 5, true);


--
-- Name: movimientos_inventario_movimiento_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.movimientos_inventario_movimiento_id_seq', 1, false);


--
-- Name: pagos_pago_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.pagos_pago_id_seq', 1, false);


--
-- Name: pedido_adicionales_pedido_adicional_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.pedido_adicionales_pedido_adicional_id_seq', 1, false);


--
-- Name: pedidos_pedido_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.pedidos_pedido_id_seq', 1, false);


--
-- Name: productos_producto_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.productos_producto_id_seq', 1, false);


--
-- Name: roles_rol_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.roles_rol_id_seq', 3, true);


--
-- Name: usuarios_usuario_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.usuarios_usuario_id_seq', 2, true);


--
-- Name: ventas_venta_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.ventas_venta_id_seq', 1, false);


--
-- Name: adicionales adicionales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adicionales
    ADD CONSTRAINT adicionales_pkey PRIMARY KEY (adicional_id);


--
-- Name: adicionales_productos adicionales_productos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adicionales_productos
    ADD CONSTRAINT adicionales_productos_pkey PRIMARY KEY (adicional_id, producto_id);


--
-- Name: auditoria auditoria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria
    ADD CONSTRAINT auditoria_pkey PRIMARY KEY (auditoria_id);


--
-- Name: categorias categorias_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_nombre_key UNIQUE (nombre);


--
-- Name: categorias categorias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.categorias
    ADD CONSTRAINT categorias_pkey PRIMARY KEY (categoria_id);


--
-- Name: comprobante_impresiones comprobante_impresiones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comprobante_impresiones
    ADD CONSTRAINT comprobante_impresiones_pkey PRIMARY KEY (impresion_id);


--
-- Name: comprobantes comprobantes_codigo_verificacion_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comprobantes
    ADD CONSTRAINT comprobantes_codigo_verificacion_key UNIQUE (codigo_verificacion);


--
-- Name: comprobantes comprobantes_numero_comprobante_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comprobantes
    ADD CONSTRAINT comprobantes_numero_comprobante_key UNIQUE (numero_comprobante);


--
-- Name: comprobantes comprobantes_pedido_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comprobantes
    ADD CONSTRAINT comprobantes_pedido_id_key UNIQUE (pedido_id);


--
-- Name: comprobantes comprobantes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comprobantes
    ADD CONSTRAINT comprobantes_pkey PRIMARY KEY (comprobante_id);


--
-- Name: comprobantes comprobantes_venta_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comprobantes
    ADD CONSTRAINT comprobantes_venta_id_key UNIQUE (venta_id);


--
-- Name: detalle_pedido_adicionales detalle_pedido_adicionales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_pedido_adicionales
    ADD CONSTRAINT detalle_pedido_adicionales_pkey PRIMARY KEY (detalle_pedido_adicional_id);


--
-- Name: detalle_pedido detalle_pedido_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_pedido
    ADD CONSTRAINT detalle_pedido_pkey PRIMARY KEY (detalle_id);


--
-- Name: metodos_pago metodos_pago_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metodos_pago
    ADD CONSTRAINT metodos_pago_nombre_key UNIQUE (nombre);


--
-- Name: metodos_pago metodos_pago_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.metodos_pago
    ADD CONSTRAINT metodos_pago_pkey PRIMARY KEY (metodo_pago_id);


--
-- Name: movimientos_inventario movimientos_inventario_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_inventario
    ADD CONSTRAINT movimientos_inventario_pkey PRIMARY KEY (movimiento_id);


--
-- Name: pagos pagos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_pkey PRIMARY KEY (pago_id);


--
-- Name: pedido_adicionales pedido_adicionales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_adicionales
    ADD CONSTRAINT pedido_adicionales_pkey PRIMARY KEY (pedido_adicional_id);


--
-- Name: pedidos pedidos_numero_pedido_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_numero_pedido_key UNIQUE (numero_pedido);


--
-- Name: pedidos pedidos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_pkey PRIMARY KEY (pedido_id);


--
-- Name: productos productos_codigo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_codigo_key UNIQUE (codigo);


--
-- Name: productos productos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_pkey PRIMARY KEY (producto_id);


--
-- Name: roles roles_nombre_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_nombre_key UNIQUE (nombre);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (rol_id);


--
-- Name: usuarios uq_usuarios_documento; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT uq_usuarios_documento UNIQUE (tipo_documento, numero_documento);


--
-- Name: usuario_roles usuario_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_roles
    ADD CONSTRAINT usuario_roles_pkey PRIMARY KEY (usuario_id, rol_id);


--
-- Name: usuarios usuarios_nombre_usuario_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_nombre_usuario_key UNIQUE (nombre_usuario);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (usuario_id);


--
-- Name: ventas ventas_numero_venta_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventas
    ADD CONSTRAINT ventas_numero_venta_key UNIQUE (numero_venta);


--
-- Name: ventas ventas_pedido_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventas
    ADD CONSTRAINT ventas_pedido_id_key UNIQUE (pedido_id);


--
-- Name: ventas ventas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventas
    ADD CONSTRAINT ventas_pkey PRIMARY KEY (venta_id);


--
-- Name: idx_adicionales_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_adicionales_activo ON public.adicionales USING btree (activo);


--
-- Name: idx_adicionales_productos_producto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_adicionales_productos_producto ON public.adicionales_productos USING btree (producto_id, adicional_id);


--
-- Name: idx_auditoria_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auditoria_fecha ON public.auditoria USING btree (fecha_evento);


--
-- Name: idx_detalle_pedido; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_detalle_pedido ON public.detalle_pedido USING btree (pedido_id);


--
-- Name: idx_detalle_pedido_adicionales_detalle; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_detalle_pedido_adicionales_detalle ON public.detalle_pedido_adicionales USING btree (detalle_id);


--
-- Name: idx_detalle_producto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_detalle_producto ON public.detalle_pedido USING btree (producto_id);


--
-- Name: idx_inventario_producto_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventario_producto_fecha ON public.movimientos_inventario USING btree (producto_id, fecha_movimiento);


--
-- Name: idx_pagos_fecha_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pagos_fecha_estado ON public.pagos USING btree (fecha_pago, estado);


--
-- Name: idx_pagos_pedido; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pagos_pedido ON public.pagos USING btree (pedido_id);


--
-- Name: idx_pedido_adicionales_pedido; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedido_adicionales_pedido ON public.pedido_adicionales USING btree (pedido_id);


--
-- Name: idx_pedidos_cajero_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedidos_cajero_fecha ON public.pedidos USING btree (cajero_id, fecha_pedido);


--
-- Name: idx_pedidos_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedidos_estado ON public.pedidos USING btree (estado, estado_entrega);


--
-- Name: idx_pedidos_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedidos_fecha ON public.pedidos USING btree (fecha_pedido);


--
-- Name: idx_productos_categoria; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_productos_categoria ON public.productos USING btree (categoria_id);


--
-- Name: idx_productos_disponibles; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_productos_disponibles ON public.productos USING btree (disponible) WHERE (eliminado_en IS NULL);


--
-- Name: idx_ventas_cajero_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ventas_cajero_fecha ON public.ventas USING btree (cajero_id, fecha_venta);


--
-- Name: idx_ventas_fecha_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ventas_fecha_estado ON public.ventas USING btree (fecha_venta, estado);


--
-- Name: productos trg_productos_actualizado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_productos_actualizado BEFORE UPDATE ON public.productos FOR EACH ROW EXECUTE FUNCTION public.actualizar_fecha_modificacion();


--
-- Name: usuarios trg_usuarios_actualizado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_usuarios_actualizado BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.actualizar_fecha_modificacion();


--
-- Name: adicionales adicionales_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adicionales
    ADD CONSTRAINT adicionales_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(producto_id);


--
-- Name: adicionales_productos adicionales_productos_adicional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adicionales_productos
    ADD CONSTRAINT adicionales_productos_adicional_id_fkey FOREIGN KEY (adicional_id) REFERENCES public.adicionales(adicional_id) ON DELETE CASCADE;


--
-- Name: adicionales_productos adicionales_productos_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.adicionales_productos
    ADD CONSTRAINT adicionales_productos_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(producto_id) ON DELETE CASCADE;


--
-- Name: auditoria auditoria_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auditoria
    ADD CONSTRAINT auditoria_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(usuario_id) ON DELETE SET NULL;


--
-- Name: comprobante_impresiones comprobante_impresiones_comprobante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comprobante_impresiones
    ADD CONSTRAINT comprobante_impresiones_comprobante_id_fkey FOREIGN KEY (comprobante_id) REFERENCES public.comprobantes(comprobante_id);


--
-- Name: comprobante_impresiones comprobante_impresiones_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comprobante_impresiones
    ADD CONSTRAINT comprobante_impresiones_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(usuario_id);


--
-- Name: comprobantes comprobantes_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comprobantes
    ADD CONSTRAINT comprobantes_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(pedido_id);


--
-- Name: comprobantes comprobantes_venta_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comprobantes
    ADD CONSTRAINT comprobantes_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.ventas(venta_id);


--
-- Name: detalle_pedido_adicionales detalle_pedido_adicionales_adicional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_pedido_adicionales
    ADD CONSTRAINT detalle_pedido_adicionales_adicional_id_fkey FOREIGN KEY (adicional_id) REFERENCES public.adicionales(adicional_id) ON DELETE SET NULL;


--
-- Name: detalle_pedido_adicionales detalle_pedido_adicionales_detalle_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_pedido_adicionales
    ADD CONSTRAINT detalle_pedido_adicionales_detalle_id_fkey FOREIGN KEY (detalle_id) REFERENCES public.detalle_pedido(detalle_id) ON DELETE CASCADE;


--
-- Name: detalle_pedido detalle_pedido_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_pedido
    ADD CONSTRAINT detalle_pedido_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(pedido_id);


--
-- Name: detalle_pedido detalle_pedido_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.detalle_pedido
    ADD CONSTRAINT detalle_pedido_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(producto_id) ON DELETE SET NULL;


--
-- Name: movimientos_inventario movimientos_inventario_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_inventario
    ADD CONSTRAINT movimientos_inventario_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(pedido_id);


--
-- Name: movimientos_inventario movimientos_inventario_producto_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_inventario
    ADD CONSTRAINT movimientos_inventario_producto_id_fkey FOREIGN KEY (producto_id) REFERENCES public.productos(producto_id);


--
-- Name: movimientos_inventario movimientos_inventario_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.movimientos_inventario
    ADD CONSTRAINT movimientos_inventario_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(usuario_id);


--
-- Name: pagos pagos_metodo_pago_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_metodo_pago_id_fkey FOREIGN KEY (metodo_pago_id) REFERENCES public.metodos_pago(metodo_pago_id);


--
-- Name: pagos pagos_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(pedido_id);


--
-- Name: pagos pagos_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.usuarios(usuario_id);


--
-- Name: pedido_adicionales pedido_adicionales_adicional_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_adicionales
    ADD CONSTRAINT pedido_adicionales_adicional_id_fkey FOREIGN KEY (adicional_id) REFERENCES public.adicionales(adicional_id) ON DELETE SET NULL;


--
-- Name: pedido_adicionales pedido_adicionales_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido_adicionales
    ADD CONSTRAINT pedido_adicionales_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(pedido_id) ON DELETE CASCADE;


--
-- Name: pedidos pedidos_cajero_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_cajero_id_fkey FOREIGN KEY (cajero_id) REFERENCES public.usuarios(usuario_id);


--
-- Name: pedidos pedidos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidos
    ADD CONSTRAINT pedidos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.usuarios(usuario_id) ON DELETE SET NULL;


--
-- Name: productos productos_categoria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.productos
    ADD CONSTRAINT productos_categoria_id_fkey FOREIGN KEY (categoria_id) REFERENCES public.categorias(categoria_id) ON DELETE SET NULL;


--
-- Name: usuario_roles usuario_roles_rol_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_roles
    ADD CONSTRAINT usuario_roles_rol_id_fkey FOREIGN KEY (rol_id) REFERENCES public.roles(rol_id);


--
-- Name: usuario_roles usuario_roles_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_roles
    ADD CONSTRAINT usuario_roles_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(usuario_id);


--
-- Name: ventas ventas_cajero_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventas
    ADD CONSTRAINT ventas_cajero_id_fkey FOREIGN KEY (cajero_id) REFERENCES public.usuarios(usuario_id);


--
-- Name: ventas ventas_pedido_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ventas
    ADD CONSTRAINT ventas_pedido_id_fkey FOREIGN KEY (pedido_id) REFERENCES public.pedidos(pedido_id);


--
-- PostgreSQL database dump complete
--

\unrestrict LRHEJxc7RRgIYWtQOEdMCKrJ8q1sqnYu7HSpxBX67MzruNJfVbX33DZQ1gaaJRY

