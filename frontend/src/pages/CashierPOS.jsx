import { useEffect, useMemo, useState } from "react";
import {
  Banknote,
  Check,
  CreditCard,
  Minus,
  Plus,
  Printer,
  Search,
  Trash2
} from "lucide-react";
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
    return producto.controla_inventario
      ? Math.max(0, Math.floor(Number(producto.stock_actual) || 0))
      : Infinity;
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
          precio: adicional.precio,
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
  }

  const total = carrito.reduce(
    (suma, item) => suma + Number(item.precio) * item.cantidad,
    0
  );
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

      const resultado = await apiFetch("/orders/checkout", {
        method: "POST",
        body: JSON.stringify({
          metodo_pago_id: Number(metodoPago),
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
      setProductos((actuales) =>
        actuales.map((producto) =>
          producto.controla_inventario &&
          cantidadesVendidas.has(Number(producto.producto_id))
            ? {
                ...producto,
                stock_actual:
                  Number(producto.stock_actual) -
                  cantidadesVendidas.get(Number(producto.producto_id))
              }
            : producto
        )
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
        productos: productosVendidos
      });

      setCarrito([]);
      setMetodoPago("");
      setEfectivo("");
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
              <h1 className="pagina-titulo">¡Pedido cobrado!</h1>
              <p className="pagina-sub">
                Pedido {etiquetaPedido(comprobante)} · Cobro registrado el{" "}
                {formatoFecha(comprobante.fecha_emision)}
              </p>
            </div>
          </header>

          <div className="exito-layout">
            <div className="exito-izquierda no-imprimir">
              <section className="exito-tarjeta">
                <span className="exito-icono">
                  <Check size={22} aria-hidden="true" />
                </span>
                <h2>Pedido completado.</h2>
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
                  onClick={() => setComprobante(null)}
                >
                  <Plus size={16} aria-hidden="true" />
                  Nuevo pedido
                </button>
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
                  </header>

                  <p className="comprobante-numero">
                    {comprobante.numero_dia ? `Pedido N° ${comprobante.numero_dia}` : comprobante.numero_pedido}
                  </p>
                  <div className="comprobante-datos">
                    <div className="comprobante-fila">
                      <span>Fecha / hora</span>
                      <strong>{formatoFecha(comprobante.fecha_emision)}</strong>
                    </div>
                    <div className="comprobante-fila">
                      <span>Cajero</span>
                      <strong>{comprobante.cajero}</strong>
                    </div>
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

  /* ---------------- Punto de venta ---------------- */

  return (
    <AppShell area="caja" seccion="Punto de venta">
      <div className="pagina caja-pagina">
        <header className="pagina-cabecera">
          <div>
            <h1 className="pagina-titulo">Un antojo más, por favor.</h1>
            <p className="pagina-sub">
              Punto de venta · {nombreVisible(usuario)}
            </p>
          </div>

        </header>

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

          <form className="tarjeta pos-pedido" onSubmit={confirmarVenta}>
            <div className="pos-pedido-cabecera">
              <h2>Pedido actual</h2>
              {unidades > 0 && (
                <span className="chip chip-rojo">
                  {unidades} {unidades === 1 ? "unidad" : "unidades"}
                </span>
              )}
            </div>

            <div className="pos-pedido-sub">
              <span>Cliente: Mostrador</span>
              {carrito.length > 0 && (
                <button type="button" className="btn-enlace" onClick={vaciarPedido}>
                  Vaciar
                </button>
              )}
            </div>

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
                <dt>Subtotal</dt>
                <dd>{pesos(total)}</dd>
              </div>
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
              {confirmando ? "Procesando..." : "Realizar pedido"}
            </button>

            <p className="campo-ayuda">
              Al realizar el pedido se genera el comprobante y queda completado.
            </p>
          </form>
        </div>

      </div>
    </AppShell>
  );
}
