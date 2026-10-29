import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Banknote,
  Bike,
  Check,
  CreditCard,
  Minus,
  Pencil,
  Plus,
  Printer,
  Search,
  Store,
  Trash2
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AppShell from "../components/AppShell";
import { apiFetch, formatearUrlImagen } from "../services/api";
import { etiquetaPedido, leerUsuario, nombreVisible, pesos } from "../lib/formato";
import { NEGOCIO } from "../config/negocio";
import logo from "../assets/logo-elote-mania.png";
import "./admin.css";
import "./CashierPOS.css";

function formatoFecha(fecha) {
  return new Date(fecha || Date.now()).toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

const esEfectivo = (nombre = "") => /efectivo/i.test(nombre);

export default function CashierPOS() {
  const usuario = leerUsuario();
  const navigate = useNavigate();
  const [parametros] = useSearchParams();
  const editarId = parametros.get("editar");

  const [productos, setProductos] = useState([]);
  const [adicionales, setAdicionales] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [metodosPago, setMetodosPago] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [metodoPago, setMetodoPago] = useState("");
  const [efectivo, setEfectivo] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState("todas");
  const [comprobante, setComprobante] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState("");
  const [tipoPedido, setTipoPedido] = useState("local");
  const [nombreCliente, setNombreCliente] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [barrio, setBarrio] = useState("");
  const [costoDomicilio, setCostoDomicilio] = useState("");

  // Modo edición: se llega desde Reportes con /caja/ventas?editar=<pedido_id>.
  const [pedidoEdicion, setPedidoEdicion] = useState(null);
  const [cargandoEdicion, setCargandoEdicion] = useState(Boolean(editarId));
  const [errorEdicion, setErrorEdicion] = useState("");
  // Unidades que este mismo pedido ya tiene descontadas del inventario,
  // y precios con los que se cobraron originalmente.
  const [cantidadesOriginales, setCantidadesOriginales] = useState({});
  const [preciosOriginales, setPreciosOriginales] = useState({ productos: {}, adicionales: {} });

  useEffect(() => {
    async function cargarDatos() {
      try {
        const [
          respuestaProductos,
          respuestaAdicionales,
          respuestaMetodos,
          respuestaCategorias
        ] =
          await Promise.all([
            apiFetch("/products"),
            apiFetch("/additions/venta"),
            apiFetch("/payment-methods"),
            apiFetch("/categories")
          ]);

        setProductos(respuestaProductos.productos || []);
        setAdicionales(respuestaAdicionales.adicionales || []);
        setCategorias(respuestaCategorias.categorias || []);
        setMetodosPago(
          Array.isArray(respuestaMetodos)
            ? respuestaMetodos
            : respuestaMetodos.metodos || []
        );
      } catch (err) {
        setError(err.message);
      } finally {
        setCargando(false);
      }
    }

    cargarDatos();
  }, []);

  useEffect(() => {
    if (!editarId || cargando) return;

    let cancelado = false;

    async function cargarPedido() {
      setCargandoEdicion(true);
      setErrorEdicion("");

      try {
        const datos = await apiFetch(`/orders/${encodeURIComponent(editarId)}/edicion`);
        if (cancelado) return;

        const pedido = datos.pedido;
        const catalogo = new Map(productos.map((p) => [Number(p.producto_id), p]));

        const lineasProductos = datos.productos.map((linea, indice) => ({
          ...(catalogo.get(linea.producto_id) || {}),
          tipo_item: "producto",
          producto_id: linea.producto_id,
          nombre: linea.nombre,
          precio: linea.precio,
          imagen_url: catalogo.get(linea.producto_id)?.imagen_url ?? linea.imagen_url,
          linea_id: `edicion-p-${linea.producto_id}-${indice}`,
          cantidad: linea.cantidad,
          observaciones: linea.observaciones || ""
        }));

        const lineasAdicionales = datos.adicionales.map((linea) => ({
          tipo_item: "adicional",
          adicional_id: linea.adicional_id,
          nombre: linea.nombre,
          precio: linea.precio,
          linea_id: `edicion-a-${linea.adicional_id}`,
          cantidad: linea.cantidad,
          observaciones: ""
        }));

        const cantidades = {};
        const preciosProductos = {};
        for (const linea of datos.productos) {
          cantidades[linea.producto_id] = (cantidades[linea.producto_id] || 0) + linea.cantidad;
          if (!(linea.producto_id in preciosProductos)) {
            preciosProductos[linea.producto_id] = linea.precio;
          }
        }
        const preciosAdicionales = {};
        for (const linea of datos.adicionales) {
          if (!(linea.adicional_id in preciosAdicionales)) {
            preciosAdicionales[linea.adicional_id] = linea.precio;
          }
        }

        setCantidadesOriginales(cantidades);
        setPreciosOriginales({ productos: preciosProductos, adicionales: preciosAdicionales });
        setCarrito([...lineasProductos, ...lineasAdicionales]);
        setTipoPedido(pedido.tipo_pedido || "local");
        setNombreCliente(pedido.nombre_cliente_domicilio || "");
        setTelefono(pedido.telefono_domicilio || "");
        setDireccion(pedido.direccion_domicilio || "");
        setBarrio(pedido.barrio_domicilio || "");
        setCostoDomicilio(pedido.costo_domicilio ? String(pedido.costo_domicilio) : "");
        setMetodoPago(pedido.metodo_pago_id ? String(pedido.metodo_pago_id) : "");
        setEfectivo("");
        setPedidoEdicion(pedido);
      } catch (err) {
        if (!cancelado) setErrorEdicion(err.message || "No se pudo cargar el pedido.");
      } finally {
        if (!cancelado) setCargandoEdicion(false);
      }
    }

    cargarPedido();

    return () => {
      cancelado = true;
    };
    // El catálogo ya está cargado cuando `cargando` pasa a false.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editarId, cargando]);

  const productosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    return productos.filter((producto) => {
      if (
        categoriaActiva !== "todas" &&
        String(producto.categoria_id) !== categoriaActiva
      ) {
        return false;
      }

      if (!texto) return true;

      return `${producto.nombre} ${producto.codigo || ""}`
        .toLowerCase()
        .includes(texto);
    });
  }, [productos, busqueda, categoriaActiva]);

  function cantidadEnCarrito(productoId, exceptoLinea = null) {
    return carrito.reduce(
      (total, item) =>
        item.tipo_item === "producto" &&
        Number(item.producto_id) === Number(productoId) &&
        item.linea_id !== exceptoLinea
          ? total + item.cantidad
          : total,
      0
    );
  }

  function stockDisponible(producto) {
    if (!producto.controla_inventario) return Infinity;

    // Al editar, el stock del catálogo ya descuenta las unidades de este pedido.
    const propias = cantidadesOriginales[producto.producto_id] || 0;
    return Math.max(0, Math.floor(Number(producto.stock_actual) || 0) + propias);
  }

  function agregarAlCarrito(producto) {
    setComprobante(null);
    if (cantidadEnCarrito(producto.producto_id) >= stockDisponible(producto)) {
      setError(`No hay más existencias disponibles de "${producto.nombre}".`);
      return false;
    }
    setError("");

    setCarrito((actual) => {
      // Solo suma a una línea existente si no tiene observación.
      const existente = actual.find(
        (item) =>
          Number(item.producto_id) === Number(producto.producto_id) &&
          item.tipo_item === "producto" &&
          !item.observaciones.trim()
      );

      if (existente) {
        return actual.map((item) =>
          item.linea_id === existente.linea_id
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        );
      }

      return [
        ...actual,
        {
          ...producto,
          tipo_item: "producto",
          precio: preciosOriginales.productos[producto.producto_id] ?? producto.precio,
          linea_id: `${producto.producto_id}-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 7)}`,
          cantidad: 1,
          observaciones: ""
        }
      ];
    });
    return true;
  }

  function seleccionarProducto(producto) {
    agregarAlCarrito(producto);
  }

  function agregarAdicionalAlCarrito(adicional) {
    setComprobante(null);
    setError("");
    setCarrito((actual) => {
      const existente = actual.find(
        (item) =>
          item.tipo_item === "adicional" &&
          Number(item.adicional_id) === Number(adicional.adicional_id)
      );
      if (existente) {
        return actual.map((item) =>
          item.linea_id === existente.linea_id
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        );
      }

      return [
        ...actual,
        {
          tipo_item: "adicional",
          adicional_id: adicional.adicional_id,
          nombre: adicional.nombre,
          precio: preciosOriginales.adicionales[adicional.adicional_id] ?? adicional.precio,
          linea_id: `adicional-${adicional.adicional_id}-${Date.now()}`,
          cantidad: 1,
          observaciones: ""
        }
      ];
    });
  }

  function cambiarCantidad(lineaId, cantidad) {
    setComprobante(null);

    const linea = carrito.find((item) => item.linea_id === lineaId);
    if (!linea) return;

    const nuevaCantidad = Number(cantidad);
    if (
      linea.tipo_item === "producto" &&
      nuevaCantidad > 0 &&
      cantidadEnCarrito(linea.producto_id, lineaId) + nuevaCantidad >
        stockDisponible(linea)
    ) {
      setError(`No hay más existencias disponibles de "${linea.nombre}".`);
      return;
    }

    setError("");
    setCarrito((actual) =>
      actual
        .map((item) =>
          item.linea_id === lineaId
            ? { ...item, cantidad: nuevaCantidad }
            : item
        )
        .filter((item) => item.cantidad > 0)
    );
  }

  function cambiarObservacion(lineaId, texto) {
    setCarrito((actual) =>
      actual.map((item) =>
        item.linea_id === lineaId
          ? { ...item, observaciones: texto.slice(0, 250) }
          : item
      )
    );
  }

  function vaciarPedido() {
    setCarrito([]);
    setEfectivo("");
    setError("");
    setTipoPedido("local");
    setNombreCliente("");
    setTelefono("");
    setDireccion("");
    setBarrio("");
    setCostoDomicilio("");
  }

  function reiniciarEdicion() {
    setPedidoEdicion(null);
    setCantidadesOriginales({});
    setPreciosOriginales({ productos: {}, adicionales: {} });
    setErrorEdicion("");
    setCargandoEdicion(false);
  }

  function cancelarEdicion() {
    reiniciarEdicion();
    vaciarPedido();
    navigate("/caja/reportes");
  }

  function nuevoPedido() {
    setComprobante(null);

    if (editarId || pedidoEdicion) {
      reiniciarEdicion();
      navigate("/caja/ventas", { replace: true });
    }
  }

  const subtotalProductos = carrito.reduce(
    (suma, item) => suma + Number(item.precio) * item.cantidad,
    0
  );
  const valorCostoDomicilio =
    tipoPedido === "domicilio" ? Math.max(0, Number(costoDomicilio) || 0) : 0;
  const total = subtotalProductos + valorCostoDomicilio;
  const unidades = carrito.reduce((suma, item) => suma + item.cantidad, 0);

  const nombreMetodo =
    metodosPago.find((m) => Number(m.metodo_pago_id) === Number(metodoPago))
      ?.nombre || "";
  const pagaEnEfectivo = esEfectivo(nombreMetodo);
  const recibido = Number(efectivo) || 0;
  const cambio = recibido - total;
  const efectivoInsuficiente = pagaEnEfectivo && recibido > 0 && cambio < 0;

  async function confirmarVenta(event) {
    event.preventDefault();
    setError("");

    if (carrito.length === 0) {
      setError("Agrega al menos un producto al pedido.");
      return;
    }

    if (tipoPedido === "domicilio") {
      if (!nombreCliente.trim()) {
        setError("Indica a nombre de quién va el pedido a domicilio.");
        return;
      }
      if (!telefono.trim()) {
        setError("Indica el teléfono de contacto para el domicilio.");
        return;
      }
      if (!direccion.trim()) {
        setError("Indica la dirección del domicilio.");
        return;
      }
      if (!barrio.trim()) {
        setError("Indica el barrio del domicilio.");
        return;
      }
      if (costoDomicilio !== "" && Number(costoDomicilio) < 0) {
        setError("El costo del domicilio no puede ser negativo.");
        return;
      }
    }

    if (!metodoPago) {
      setError("Selecciona un método de pago.");
      return;
    }

    if (efectivoInsuficiente) {
      setError("El efectivo recibido no alcanza para cubrir el total.");
      return;
    }

    setConfirmando(true);

    try {
      // Guardamos el detalle antes de vaciar el carrito.
      const productosVendidos = carrito
        .filter((item) => item.tipo_item === "producto")
        .map((producto) => ({
          producto_id: producto.producto_id,
          nombre: producto.nombre,
          tipo_item: "producto",
          cantidad: producto.cantidad,
          precio_unitario: Number(producto.precio),
          subtotal: Number(producto.precio) * producto.cantidad,
          observaciones: producto.observaciones.trim()
        }))
        .concat(
          carrito
            .filter((item) => item.tipo_item === "adicional")
            .map((adicional) => ({
              producto_id: null,
              adicional_id: adicional.adicional_id,
              tipo_item: "adicional",
              nombre: adicional.nombre,
              cantidad: adicional.cantidad,
              precio_unitario: Number(adicional.precio),
              subtotal: Number(adicional.precio) * adicional.cantidad,
              observaciones: ""
            }))
        );

      const nombreMetodoPago = nombreMetodo || "No especificado";

      // Pedido nuevo: POST /orders/checkout. Pedido en edición: PUT /orders/:id
      // (conserva el número de pedido y de comprobante).
      const rutaGuardado = pedidoEdicion
        ? `/orders/${pedidoEdicion.pedido_id}`
        : "/orders/checkout";

      const resultado = await apiFetch(rutaGuardado, {
        method: pedidoEdicion ? "PUT" : "POST",
        body: JSON.stringify({
          metodo_pago_id: Number(metodoPago),
          tipo_pedido: tipoPedido,
          direccion_domicilio: tipoPedido === "domicilio" ? direccion.trim() : null,
          barrio_domicilio: tipoPedido === "domicilio" ? barrio.trim() : null,
          telefono_domicilio: tipoPedido === "domicilio" ? telefono.trim() : null,
          nombre_cliente_domicilio: tipoPedido === "domicilio" ? nombreCliente.trim() : null,
          costo_domicilio: valorCostoDomicilio,
          productos: carrito
            .filter((producto) => producto.tipo_item === "producto")
            .map((producto) => ({
              producto_id: producto.producto_id,
              cantidad: producto.cantidad,
              observaciones: producto.observaciones.trim()
            })),
          adicionales: carrito
            .filter((item) => item.tipo_item === "adicional")
            .map((item) => ({
              adicional_id: Number(item.adicional_id),
              cantidad: item.cantidad
            }))
        })
      });

      const datosComprobante = resultado.comprobante || {};
      const totalCobrado = datosComprobante.total ?? total;

      const cantidadesVendidas = new Map();
      for (const item of carrito) {
        if (item.tipo_item !== "producto") continue;
        const id = Number(item.producto_id);
        cantidadesVendidas.set(
          id,
          (cantidadesVendidas.get(id) || 0) + Number(item.cantidad)
        );
      }
      // Stock local = stock - (unidades ahora - unidades que el pedido ya tenía).
      // En una venta nueva las "unidades que ya tenía" son 0.
      setProductos((actuales) =>
        actuales.map((producto) => {
          if (!producto.controla_inventario) return producto;

          const id = Number(producto.producto_id);
          const diferencia =
            (cantidadesVendidas.get(id) || 0) - (cantidadesOriginales[id] || 0);

          return diferencia === 0
            ? producto
            : { ...producto, stock_actual: Number(producto.stock_actual) - diferencia };
        })
      );

      setComprobante({
        ...datosComprobante,
        numero_dia:
          resultado.pedido?.numero_dia ?? datosComprobante.numero_dia ?? null,
        numero_pedido:
          resultado.pedido?.numero_pedido ||
          datosComprobante.numero_pedido ||
          `P-${String(resultado.pedido?.pedido_id || "").padStart(6, "0")}`,
        numero_comprobante:
          datosComprobante.numero_comprobante || "Pendiente",
        fecha_emision:
          datosComprobante.fecha_emision || new Date().toISOString(),
        total: totalCobrado,
        metodo_pago: nombreMetodoPago,
        cajero: resultado.cajero || nombreVisible(usuario),
        efectivo_recibido:
          esEfectivo(nombreMetodoPago) && recibido > 0 ? recibido : null,
        cambio:
          esEfectivo(nombreMetodoPago) && recibido > 0
            ? recibido - Number(totalCobrado)
            : null,
        productos: datosComprobante.productos?.length
          ? datosComprobante.productos
          : productosVendidos,
        tipo_pedido: tipoPedido,
        direccion_domicilio: tipoPedido === "domicilio" ? direccion.trim() : null,
        barrio_domicilio: tipoPedido === "domicilio" ? barrio.trim() : null,
        telefono_domicilio: tipoPedido === "domicilio" ? telefono.trim() : null,
        nombre_cliente_domicilio: tipoPedido === "domicilio" ? nombreCliente.trim() : null,
        costo_domicilio: valorCostoDomicilio
      });

      setCarrito([]);
      setMetodoPago("");
      setEfectivo("");
      setTipoPedido("local");
      setNombreCliente("");
      setTelefono("");
      setDireccion("");
      setBarrio("");
      setCostoDomicilio("");
    } catch (err) {
      setError(err.message);
    } finally {
      setConfirmando(false);
    }
  }

  /* ---------------- Pedido cobrado + comprobante ---------------- */

  if (comprobante) {
    return (
      <AppShell area="caja" seccion="Punto de venta">
        <div className="pagina caja-pagina">
          <header className="pagina-cabecera no-imprimir">
            <div>
              <h1 className="pagina-titulo">
                {comprobante.cantidad_ediciones > 0 ? "¡Pedido modificado!" : "¡Pedido cobrado!"}
              </h1>
              <p className="pagina-sub">
                Pedido {etiquetaPedido(comprobante)} ·{" "}
                {comprobante.cantidad_ediciones > 0
                  ? `Modificado el ${formatoFecha(comprobante.ultima_edicion)}`
                  : `Cobro registrado el ${formatoFecha(comprobante.fecha_emision)}`}
              </p>
            </div>
          </header>

          <div className="exito-layout">
            <div className="exito-izquierda no-imprimir">
              <section className="exito-tarjeta">
                <span className="exito-icono">
                  <Check size={22} aria-hidden="true" />
                </span>
                <h2>
                  {comprobante.cantidad_ediciones > 0
                    ? "Pedido actualizado."
                    : "Pedido completado."}
                </h2>
                {comprobante.cantidad_ediciones > 0 && (
                  <p className="exito-detalle">
                    Mantiene su número de pedido y de comprobante. Imprime el voucher nuevo y
                    retira el anterior al cliente.
                  </p>
                )}
                {comprobante.efectivo_recibido ? (
                  <p className="exito-detalle">
                    Recibiste {pesos(comprobante.efectivo_recibido)}. Entrega{" "}
                    {pesos(comprobante.cambio)} de cambio y el comprobante al cliente.
                  </p>
                ) : (
                  <p className="exito-detalle">
                    Pago registrado con {comprobante.metodo_pago}. Entrega el
                    comprobante al cliente.
                  </p>
                )}
                <div className="exito-total">
                  <span>Total cobrado</span>
                  <strong>{pesos(comprobante.total)}</strong>
                </div>
              </section>

              <div className="exito-acciones">
                <button
                  type="button"
                  className="btn btn-primario"
                  onClick={() => window.print()}
                >
                  <Printer size={16} aria-hidden="true" />
                  Imprimir comprobante
                </button>
                <button
                  type="button"
                  className="btn btn-secundario"
                  onClick={nuevoPedido}
                >
                  <Plus size={16} aria-hidden="true" />
                  Nuevo pedido
                </button>
                {comprobante.cantidad_ediciones > 0 && (
                  <button
                    type="button"
                    className="btn btn-secundario"
                    onClick={() => {
                      reiniciarEdicion();
                      navigate("/caja/reportes");
                    }}
                  >
                    <ArrowLeft size={16} aria-hidden="true" />
                    Volver a reportes
                  </button>
                )}
              </div>
              <p className="campo-ayuda">
                Impresión térmica · 80 mm · Puedes reimprimir sin duplicar la venta.
              </p>
            </div>

            <div className="exito-derecha">
              <p className="exito-etiqueta no-imprimir">
                <span>Comprobante · vista de impresión</span>
                <span>80 mm</span>
              </p>

              <section className="caja-comprobante">
                <div className="comprobante-contenido">
                  <header className="comprobante-encabezado">
                    <img className="comprobante-logo" src={logo} alt="" width="76" height="76" />
                    <h2>ELOTE MANÍA</h2>
                    <p>WhatsApp {NEGOCIO.whatsapp}</p>
                    <small>Comprobante de pedido · COP</small>
                    {comprobante.cantidad_ediciones > 0 && (
                      <span className="comprobante-reimpresion-tag">
                        ** PEDIDO MODIFICADO (versión #{Number(comprobante.cantidad_ediciones) + 1}) **
                      </span>
                    )}
                  </header>

                  <p className="comprobante-numero">
                    {comprobante.numero_dia ? `Pedido N° ${comprobante.numero_dia}` : comprobante.numero_pedido}
                  </p>
                  <div className="comprobante-tipo-etiqueta">
                    <span className={comprobante.tipo_pedido === "domicilio" ? "comprobante-tag-domicilio" : "comprobante-tag-local"}>
                      {comprobante.tipo_pedido === "domicilio" ? "🛵 DOMICILIO" : "🏪 EN LOCAL"}
                    </span>
                  </div>
                  <div className="comprobante-datos">
                    <div className="comprobante-fila">
                      <span>Fecha / hora</span>
                      <strong>{formatoFecha(comprobante.fecha_emision)}</strong>
                    </div>
                    {comprobante.cantidad_ediciones > 0 && comprobante.ultima_edicion && (
                      <div className="comprobante-fila">
                        <span>Modificado</span>
                        <strong>{formatoFecha(comprobante.ultima_edicion)}</strong>
                      </div>
                    )}
                    <div className="comprobante-fila">
                      <span>Cajero</span>
                      <strong>{comprobante.cajero}</strong>
                    </div>
                    {comprobante.tipo_pedido === "domicilio" && (
                      <>
                        <div className="comprobante-fila">
                          <span>A nombre de</span>
                          <strong>{comprobante.nombre_cliente_domicilio}</strong>
                        </div>
                        <div className="comprobante-fila">
                          <span>Teléfono</span>
                          <strong>{comprobante.telefono_domicilio}</strong>
                        </div>
                        <div className="comprobante-fila">
                          <span>Dirección</span>
                          <strong>{comprobante.direccion_domicilio}</strong>
                        </div>
                        <div className="comprobante-fila">
                          <span>Barrio</span>
                          <strong>{comprobante.barrio_domicilio}</strong>
                        </div>
                      </>
                    )}
                    <div className="comprobante-fila">
                      <span>Comprobante</span>
                      <strong>{comprobante.numero_comprobante}</strong>
                    </div>
                  </div>

                  <div className="comprobante-productos">
                    {comprobante.productos.map((producto, indice) => (
                      <div
                        className="comprobante-producto"
                        key={`${producto.producto_id}-${indice}`}
                      >
                        <div className="comprobante-producto-info">
                          <span className="comprobante-producto-nombre">
                            {producto.tipo_item === "adicional" && "Adicional · "}
                            {producto.cantidad} × {producto.nombre}
                          </span>
                          <small>Precio unitario: {pesos(producto.precio_unitario)}</small>
                          {producto.observaciones && (
                            <span className="comprobante-observacion">
                              observacion: {producto.observaciones}
                            </span>
                          )}
                        </div>
                        <span className="comprobante-producto-total">
                          {pesos(producto.subtotal)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {comprobante.tipo_pedido === "domicilio" && Number(comprobante.costo_domicilio) > 0 && (
                    <div className="comprobante-fila comprobante-fila-domicilio">
                      <span>Costo de domicilio</span>
                      <strong>{pesos(comprobante.costo_domicilio)}</strong>
                    </div>
                  )}
                  <div className="comprobante-total">
                    <span>TOTAL COBRADO</span>
                    <strong>{pesos(comprobante.total)}</strong>
                  </div>

                  <div className="comprobante-datos comprobante-pago">
                    <div className="comprobante-fila">
                      <span>Método de pago</span>
                      <strong>{comprobante.metodo_pago}</strong>
                    </div>
                    {comprobante.efectivo_recibido && (
                      <>
                        <div className="comprobante-fila">
                          <span>Efectivo recibido</span>
                          <strong>{pesos(comprobante.efectivo_recibido)}</strong>
                        </div>
                        <div className="comprobante-fila">
                          <span>Cambio</span>
                          <strong>{pesos(comprobante.cambio)}</strong>
                        </div>
                      </>
                    )}
                  </div>

                  <footer className="comprobante-pie">
                    <strong>Pedido completado</strong>
                    <span>¡Gracias por tu compra!</span>
                  </footer>
                </div>
              </section>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  /* ---------------- Edición: cargando / no disponible ---------------- */

  if (editarId && errorEdicion) {
    return (
      <AppShell area="caja" seccion="Editar pedido">
        <div className="pagina caja-pagina">
          <header className="pagina-cabecera">
            <div>
              <h1 className="pagina-titulo">No se puede editar este pedido</h1>
            </div>
          </header>

          <p className="aviso aviso-error" role="alert">{errorEdicion}</p>

          <div>
            <button
              type="button"
              className="btn btn-secundario"
              onClick={() => {
                reiniciarEdicion();
                navigate("/caja/reportes");
              }}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Volver a reportes
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  if (editarId && !pedidoEdicion && (cargando || cargandoEdicion)) {
    return (
      <AppShell area="caja" seccion="Editar pedido">
        <div className="pagina caja-pagina">
          <p className="vacio" role="status">Cargando el pedido...</p>
        </div>
      </AppShell>
    );
  }

  /* ---------------- Punto de venta ---------------- */

  return (
    <AppShell area="caja" seccion={pedidoEdicion ? "Editar pedido" : "Punto de venta"}>
      <div className="pagina caja-pagina">
        <header className="pagina-cabecera">
          <div>
            <h1 className="pagina-titulo">
              {pedidoEdicion
                ? `Editar pedido ${etiquetaPedido(pedidoEdicion)}`
                : "Un antojo más, por favor."}
            </h1>
            <p className="pagina-sub">
              Punto de venta · {nombreVisible(usuario)}
            </p>
          </div>

        </header>

        {pedidoEdicion && (
          <div className="pos-edicion-banner no-imprimir" role="status">
            <Pencil size={18} aria-hidden="true" />
            <div>
              <strong>Estás modificando un pedido ya cobrado</strong>
              <span>
                Conserva el número de pedido {etiquetaPedido(pedidoEdicion)} y el comprobante{" "}
                {pedidoEdicion.numero_comprobante}. Agrega o quita productos y guarda para
                generar el voucher nuevo.
              </span>
            </div>
            <button
              type="button"
              className="btn btn-secundario btn-sm"
              onClick={cancelarEdicion}
              disabled={confirmando}
            >
              Cancelar edición
            </button>
          </div>
        )}

        {error && <p className="aviso aviso-error" role="alert">{error}</p>}

        <div className="pos-layout">
          <section className="pos-catalogo" aria-label="Productos">
            <div className="busqueda">
              <Search size={18} aria-hidden="true" />
              <input
                className="entrada"
                type="search"
                placeholder="Buscar producto o código…"
                aria-label="Buscar producto"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>

            <div className="menu-categorias pos-categorias" role="group" aria-label="Categorías">
              <button
                type="button"
                className={categoriaActiva === "todas" ? "activa" : ""}
                aria-pressed={categoriaActiva === "todas"}
                onClick={() => setCategoriaActiva("todas")}
              >
                Todos
              </button>
              {categorias.map((categoria) => {
                const id = String(categoria.categoria_id);

                return (
                  <button
                    type="button"
                    key={categoria.categoria_id}
                    className={categoriaActiva === id ? "activa" : ""}
                    aria-pressed={categoriaActiva === id}
                    onClick={() => setCategoriaActiva(id)}
                  >
                    {categoria.nombre}
                  </button>
                );
              })}
            </div>

            <p className="pos-conteo">
              <span>Agrega productos y adicionales por separado al pedido</span>
              <span>{productosFiltrados.length} productos</span>
            </p>

            {cargando ? (
              <p className="vacio">Cargando productos...</p>
            ) : productosFiltrados.length === 0 ? (
              <p className="vacio">No hay productos que coincidan con la búsqueda.</p>
            ) : (
              <div className="pos-productos">
                {productosFiltrados.map((producto) => {
                  const disponible =
                    !producto.controla_inventario ||
                    stockDisponible(producto) > 0;
                  const agotadoEnPedido =
                    cantidadEnCarrito(producto.producto_id) >=
                    stockDisponible(producto);

                  return (
                    <article
                      className={`pos-producto${!disponible ? " agotado" : ""}`}
                      key={producto.producto_id}
                    >
                      {producto.imagen_url ? (
                        <img
                          src={formatearUrlImagen(producto.imagen_url)}
                          alt=""
                          loading="lazy"
                        />
                      ) : (
                        <span className="pos-sin-foto">
                          <img src={logo} alt="" />
                        </span>
                      )}

                      <div className="pos-producto-info">
                        <strong>{producto.nombre}</strong>
                        {producto.controla_inventario && (
                          <small className="pos-stock">
                            {disponible
                              ? `${Math.max(
                                  0,
                                  stockDisponible(producto) -
                                    cantidadEnCarrito(producto.producto_id)
                                )} disponibles`
                              : "Agotado"}
                          </small>
                        )}
                        <span className="pos-producto-pie">
                          <span className="pos-precio">
                            {pesos(producto.precio)}
                          </span>
                        </span>
                      </div>

                      <button
                        className="pos-producto-agregar"
                        type="button"
                        onClick={() => seleccionarProducto(producto)}
                        aria-label={`Agregar ${producto.nombre} al pedido, ${pesos(producto.precio)}`}
                        disabled={!disponible || agotadoEnPedido}
                      >
                        <Plus size={16} aria-hidden="true" />
                        Agregar al pedido
                      </button>
                    </article>
                  );
                })}
              </div>
            )}

            {adicionales.length > 0 && (
              <section className="pos-adicionales-catalogo" aria-label="Adicionales">
                <header>
                  <h2>Adicionales</h2>
                  <p>Se agregan como artículos independientes al pedido.</p>
                </header>
                <div className="pos-adicionales-productos">
                  {adicionales.map((adicional) => (
                    <article
                      className="pos-adicional-producto"
                      key={adicional.adicional_id}
                    >
                      <div>
                        <strong>{adicional.nombre}</strong>
                        <span>{pesos(adicional.precio)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => agregarAdicionalAlCarrito(adicional)}
                        aria-label={`Agregar ${adicional.nombre} al pedido, ${pesos(adicional.precio)}`}
                      >
                        <Plus size={16} aria-hidden="true" />
                        Agregar
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </section>

          <form id="seccion-pedido-actual" className="tarjeta pos-pedido" onSubmit={confirmarVenta}>
            <div className="pos-pedido-cabecera">
              <h2>Pedido actual</h2>
              {unidades > 0 && (
                <span className="chip chip-rojo">
                  {unidades} {unidades === 1 ? "unidad" : "unidades"}
                </span>
              )}
            </div>

            <div className="pos-tipo-selector" role="radiogroup" aria-label="Tipo de pedido">
              <button
                type="button"
                className={`pos-tipo-btn ${tipoPedido === "local" ? "activo" : ""}`}
                onClick={() => setTipoPedido("local")}
                aria-checked={tipoPedido === "local"}
                role="radio"
              >
                <Store size={15} aria-hidden="true" />
                <span>En local</span>
              </button>
              <button
                type="button"
                className={`pos-tipo-btn ${tipoPedido === "domicilio" ? "activo" : ""}`}
                onClick={() => setTipoPedido("domicilio")}
                aria-checked={tipoPedido === "domicilio"}
                role="radio"
              >
                <Bike size={15} aria-hidden="true" />
                <span>A domicilio</span>
              </button>
            </div>

            <div className="pos-pedido-sub">
              <span>
                {tipoPedido === "domicilio"
                  ? `Domicilio ${nombreCliente.trim() ? "· " + nombreCliente.trim() : ""}`
                  : "Cliente: Mostrador"}
              </span>
              {carrito.length > 0 && (
                <button type="button" className="btn-enlace" onClick={vaciarPedido}>
                  Vaciar
                </button>
              )}
            </div>

            {tipoPedido === "domicilio" && (
              <div className="pos-domicilio-seccion">
                <div className="pos-domicilio-titulo">
                  <Bike size={16} />
                  <span>Datos del domicilio</span>
                </div>

                <div className="campo">
                  <label htmlFor="pos-nombre-cliente">A nombre de quién *</label>
                  <input
                    id="pos-nombre-cliente"
                    className="entrada"
                    type="text"
                    maxLength={150}
                    placeholder="Ej. Juan Pérez"
                    value={nombreCliente}
                    onChange={(e) => setNombreCliente(e.target.value)}
                  />
                </div>

                <div className="campo">
                  <label htmlFor="pos-telefono">Teléfono *</label>
                  <input
                    id="pos-telefono"
                    className="entrada"
                    type="tel"
                    maxLength={30}
                    placeholder="Ej. 300 123 4567"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                  />
                </div>

                <div className="campo">
                  <label htmlFor="pos-direccion">Dirección *</label>
                  <input
                    id="pos-direccion"
                    className="entrada"
                    type="text"
                    maxLength={250}
                    placeholder="Ej. Calle 10 # 20-30 Apto 201"
                    value={direccion}
                    onChange={(e) => setDireccion(e.target.value)}
                  />
                </div>

                <div className="campo">
                  <label htmlFor="pos-barrio">Barrio *</label>
                  <input
                    id="pos-barrio"
                    className="entrada"
                    type="text"
                    maxLength={150}
                    placeholder="Ej. La Floresta"
                    value={barrio}
                    onChange={(e) => setBarrio(e.target.value)}
                  />
                </div>

                <div className="campo">
                  <label htmlFor="pos-costo-domicilio">Costo del domicilio (COP)</label>
                  <input
                    id="pos-costo-domicilio"
                    className="entrada"
                    type="number"
                    min="0"
                    step="500"
                    placeholder="0"
                    value={costoDomicilio}
                    onChange={(e) => setCostoDomicilio(e.target.value)}
                  />
                </div>
              </div>
            )}

            {carrito.length === 0 ? (
              <p className="pos-vacio">
                El pedido está vacío. Agrega un producto o un adicional para comenzar.
              </p>
            ) : (
              <ul className="pos-lineas">
                {carrito.map((item) => (
                  <li className="pos-linea" key={item.linea_id}>
                    <img
                      className="miniatura"
                      src={
                        item.tipo_item === "producto"
                          ? formatearUrlImagen(item.imagen_url) || logo
                          : logo
                      }
                      alt=""
                    />

                    <div className="pos-linea-info">
                      {item.tipo_item === "adicional" && (
                        <small className="pos-linea-tipo">Adicional</small>
                      )}
                      <strong>{item.nombre}</strong>
                      <small>
                        {item.cantidad} × {pesos(item.precio)}
                      </small>

                      <div className="pos-contador">
                        <button
                          type="button"
                          onClick={() => cambiarCantidad(item.linea_id, item.cantidad - 1)}
                          aria-label={`Quitar una unidad de ${item.nombre}`}
                        >
                          <Minus size={14} />
                        </button>
                        <span aria-live="polite">{item.cantidad}</span>
                        <button
                          type="button"
                          onClick={() => cambiarCantidad(item.linea_id, item.cantidad + 1)}
                          aria-label={`Agregar una unidad de ${item.nombre}`}
                          disabled={
                            item.tipo_item === "producto" &&
                            cantidadEnCarrito(item.producto_id) >=
                              stockDisponible(item)
                          }
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      {item.tipo_item === "producto" && (
                        <input
                          className="entrada pos-observacion"
                          type="text"
                          maxLength={250}
                          placeholder="Observación (ej. sin cebolla)"
                          aria-label={`Observación para ${item.nombre}`}
                          value={item.observaciones}
                          onChange={(e) =>
                            cambiarObservacion(item.linea_id, e.target.value)
                          }
                        />
                      )}
                    </div>

                    <div className="pos-linea-total">
                      <strong>
                        {pesos(Number(item.precio) * item.cantidad)}
                      </strong>
                      <button
                        type="button"
                        className="btn-icono"
                        onClick={() => cambiarCantidad(item.linea_id, 0)}
                        aria-label={`Quitar ${item.nombre} del pedido`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <dl className="pos-totales">
              <div>
                <dt>Subtotal productos</dt>
                <dd>{pesos(subtotalProductos)}</dd>
              </div>
              {tipoPedido === "domicilio" && (
                <div>
                  <dt>Costo domicilio</dt>
                  <dd>{pesos(valorCostoDomicilio)}</dd>
                </div>
              )}
              <div className="pos-total-final">
                <dt>Total a cobrar</dt>
                <dd>{pesos(total)}</dd>
              </div>
              <p className="campo-ayuda">Precio final · Impuestos incluidos</p>
            </dl>

            <div className="campo">
              <span className="campo-etiqueta" id="etiqueta-pago">Método de pago</span>
              <div className="pos-metodos" role="group" aria-labelledby="etiqueta-pago">
                {metodosPago.map((metodo) => {
                  const activo = Number(metodoPago) === Number(metodo.metodo_pago_id);
                  const Icono = esEfectivo(metodo.nombre) ? Banknote : CreditCard;

                  return (
                    <button
                      key={metodo.metodo_pago_id}
                      type="button"
                      className={activo ? "activo" : ""}
                      aria-pressed={activo}
                      onClick={() => setMetodoPago(String(metodo.metodo_pago_id))}
                    >
                      <Icono size={16} aria-hidden="true" />
                      {metodo.nombre}
                    </button>
                  );
                })}

                {!cargando && metodosPago.length === 0 && (
                  <p className="campo-ayuda">No hay métodos de pago configurados.</p>
                )}
              </div>
            </div>

            {pagaEnEfectivo && (
              <>
                <div className="campo">
                  <label htmlFor="pos-efectivo">Efectivo recibido (COP)</label>
                  <input
                    id="pos-efectivo"
                    className="entrada"
                    type="number"
                    min="0"
                    step="500"
                    inputMode="numeric"
                    placeholder={String(total || "")}
                    value={efectivo}
                    onChange={(e) => setEfectivo(e.target.value)}
                  />
                </div>

                {recibido > 0 && (
                  <div className={`pos-cambio${cambio < 0 ? " falta" : ""}`}>
                    <span>{cambio < 0 ? "Faltan" : "Cambio"}</span>
                    <strong>{pesos(Math.abs(cambio))}</strong>
                  </div>
                )}
              </>
            )}

            <button
              className="btn btn-primario btn-bloque"
              type="submit"
              disabled={confirmando || cargando || carrito.length === 0}
            >
              <Check size={16} aria-hidden="true" />
              {confirmando
                ? "Procesando..."
                : pedidoEdicion
                  ? "Guardar cambios y generar voucher"
                  : "Realizar pedido"}
            </button>

            <p className="campo-ayuda">
              {pedidoEdicion
                ? "Se actualiza el pedido, el pago y el inventario (solo la diferencia). El número de pedido no cambia."
                : "Al realizar el pedido se genera el comprobante y queda completado."}
            </p>
          </form>
        </div>

        {unidades > 0 && (
          <aside className="pos-barra-flotante-movil no-imprimir">
            <button
              type="button"
              className="btn btn-primario pos-btn-flotante"
              onClick={() => {
                document.getElementById("seccion-pedido-actual")?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              <span>🛒 Ver pedido ({unidades})</span>
              <strong>{pesos(total)} →</strong>
            </button>
          </aside>
        )}

      </div>
    </AppShell>
  );
}
