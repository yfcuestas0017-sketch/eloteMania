import { useEffect, useMemo, useState } from "react";
import {
  Bike,
  Calendar,
  ChefHat,
  CreditCard,
  FileText,
  Pencil,
  Printer,
  RefreshCw,
  Search,
  ShoppingBag,
  Store,
  Trash2
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import ComprobanteModal from "../components/ComprobanteModal";
import ConfirmDialog from "../components/ConfirmDialog";
import { etiquetaPedido, fechaLocal, leerUsuario, pesos } from "../lib/formato";
import { apiFetch } from "../services/api";
import "./admin.css";
import "./CashierReports.css";

function formatoFecha(fecha) {
  return new Date(fecha).toLocaleString("es-CO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

export default function CashierReports() {
  const hoy = fechaLocal();
  const navigate = useNavigate();
  const usuario = leerUsuario();
  const esAdmin = Array.isArray(usuario.roles) && usuario.roles.includes("ADMIN");

  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [pedidos, setPedidos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [comprobanteSeleccionado, setComprobanteSeleccionado] = useState(null);
  const [tipoFiltro, setTipoFiltro] = useState("todos"); // "todos" | "local" | "domicilio"
  const [pedidoAEliminar, setPedidoAEliminar] = useState(null);
  const [motivoEliminar, setMotivoEliminar] = useState("");
  const [eliminando, setEliminando] = useState(false);
  const [exito, setExito] = useState("");

  async function consultar(e) {
    if (e) e.preventDefault();

    if (!desde || !hasta || desde > hasta) {
      setError("Selecciona un rango de fechas válido.");
      return;
    }

    setError("");
    setCargando(true);

    try {
      const filtroTipo = tipoFiltro !== "todos" ? `&tipo_pedido=${tipoFiltro}` : "";
      const rango = `desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}${filtroTipo}`;
      const datos = await apiFetch(`/reports/pedidos-cajero?${rango}`);
      setPedidos(datos || []);
    } catch (err) {
      setError(err.message || "Error al consultar los pedidos.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    consultar();
  }, [desde, hasta, tipoFiltro]);

  function rangoRapido(tipo) {
    const dia = (restar) => {
      const d = new Date();
      d.setDate(d.getDate() - restar);
      return fechaLocal(d);
    };
    if (tipo === "ayer") return [dia(1), dia(1)];
    if (tipo === "7dias") return [dia(6), hoy];
    return [hoy, hoy];
  }

  function aplicarFiltroRapido(tipo) {
    const [d, h] = rangoRapido(tipo);
    setDesde(d);
    setHasta(h);
  }

  const esRango = (tipo) => {
    const [d, h] = rangoRapido(tipo);
    return desde === d && hasta === h;
  };

  const pedidosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtradosPorTipo = pedidos.filter((p) => {
      if (tipoFiltro === "todos") return true;
      return (p.tipo_pedido || "local") === tipoFiltro;
    });

    if (!q) return filtradosPorTipo;

    return filtradosPorTipo.filter((p) => {
      const numPedido = `${p.numero_pedido || ""} ${p.numero_dia || ""}`.toLowerCase();
      const numComp = (p.numero_comprobante || "").toLowerCase();
      const metodo = (p.metodo_pago || "").toLowerCase();
      const tieneProducto = (p.productos || []).some((item) =>
        (item.nombre || item.nombre_producto || "").toLowerCase().includes(q)
      );

      const cliente = (p.nombre_cliente_domicilio || "").toLowerCase();
      const direccion = `${p.direccion_domicilio || ""} ${p.barrio_domicilio || ""}`.toLowerCase();
      const tipo = (p.tipo_pedido || "").toLowerCase();

      return (
        numPedido.includes(q) ||
        numComp.includes(q) ||
        metodo.includes(q) ||
        cliente.includes(q) ||
        direccion.includes(q) ||
        tipo.includes(q) ||
        tieneProducto
      );
    });
  }, [pedidos, busqueda]);

  // Cifras de resumen
  const totalRecaudado = useMemo(() => {
    return pedidosFiltrados.reduce((acc, p) => acc + Number(p.total || 0), 0);
  }, [pedidosFiltrados]);

  const cantidadVentas = pedidosFiltrados.length;
  const promedioVenta = cantidadVentas > 0 ? totalRecaudado / cantidadVentas : 0;

  const estadisticasLocal = useMemo(() => {
    const list = pedidos.filter((p) => (p.tipo_pedido || "local") === "local");
    const total = list.reduce((acc, p) => acc + Number(p.total || 0), 0);
    return { cantidad: list.length, total };
  }, [pedidos]);

  const estadisticasDomicilio = useMemo(() => {
    const list = pedidos.filter((p) => p.tipo_pedido === "domicilio");
    const total = list.reduce((acc, p) => acc + Number(p.total || 0), 0);
    const costoEnvios = list.reduce((acc, p) => acc + Number(p.costo_domicilio || 0), 0);
    return { cantidad: list.length, total, costoEnvios };
  }, [pedidos]);

  // El cajero solo puede modificar pedidos de hoy; el administrador, cualquiera.
  // (El servidor vuelve a validarlo: esto solo evita mostrar botones inútiles.)
  function puedeModificar(pedido) {
    return esAdmin || fechaLocal(new Date(pedido.fecha_venta)) === hoy;
  }

  function editarPedido(pedido) {
    navigate(`/caja/ventas?editar=${pedido.pedido_id}`);
  }

  function pedirEliminacion(pedido) {
    setMotivoEliminar("");
    setPedidoAEliminar(pedido);
  }

  function cancelarEliminacion() {
    if (eliminando) return;
    setPedidoAEliminar(null);
    setMotivoEliminar("");
  }

  async function confirmarEliminacion() {
    if (!pedidoAEliminar) return;

    setEliminando(true);
    setError("");
    setExito("");

    try {
      const respuesta = await apiFetch(`/orders/${pedidoAEliminar.pedido_id}`, {
        method: "DELETE",
        body: JSON.stringify({ motivo: motivoEliminar.trim() })
      });

      const idEliminado = pedidoAEliminar.pedido_id;
      setPedidos((prev) => prev.filter((p) => p.pedido_id !== idEliminado));
      setExito(respuesta.mensaje || "Pedido eliminado.");
    } catch (err) {
      setError(err.message || "No se pudo eliminar el pedido.");
    } finally {
      setEliminando(false);
      setPedidoAEliminar(null);
      setMotivoEliminar("");
    }
  }

  function actualizarContadorImpresion(comprobanteId, nuevoConteo) {
    setPedidos((prev) =>
      prev.map((p) =>
        p.comprobante_id === comprobanteId
          ? { ...p, cantidad_impresiones: nuevoConteo }
          : p
      )
    );
  }

  return (
    <AppShell area="caja" seccion="Reportes">
      <div className="pagina">
        <header className="pagina-cabecera no-imprimir">
          <div>
            <h1 className="pagina-titulo">Mis pedidos completados</h1>
            <p className="pagina-sub">
              Historial de pedidos cobrados por ti. Puedes reimprimir el voucher, editar
              el pedido o eliminarlo.
            </p>
          </div>
        </header>

        {error && <p className="aviso aviso-error" role="alert">{error}</p>}
        {exito && <p className="aviso aviso-exito" role="status">{exito}</p>}

        {/* Filtros de fecha y búsqueda */}
        <section className="tarjeta no-imprimir">
          <form onSubmit={consultar} className="filtros-reporte">
            <div className="campo">
              <label htmlFor="caja-desde">Desde</label>
              <input
                id="caja-desde"
                className="entrada"
                type="date"
                value={desde}
                max={hasta}
                onChange={(e) => setDesde(e.target.value)}
                required
              />
            </div>

            <div className="campo">
              <label htmlFor="caja-hasta">Hasta</label>
              <input
                id="caja-hasta"
                className="entrada"
                type="date"
                value={hasta}
                min={desde}
                max={hoy}
                onChange={(e) => setHasta(e.target.value)}
                required
              />
            </div>

            <div className="campo campo-tipo-filtro">
              <label>Canal de venta</label>
              <div className="selector-tipo-reporte" role="radiogroup" aria-label="Canal de venta">
                <button
                  type="button"
                  className={`tipo-btn ${tipoFiltro === "todos" ? "activo" : ""}`}
                  onClick={() => setTipoFiltro("todos")}
                  aria-checked={tipoFiltro === "todos"}
                  role="radio"
                >
                  Todos
                </button>
                <button
                  type="button"
                  className={`tipo-btn ${tipoFiltro === "local" ? "activo" : ""}`}
                  onClick={() => setTipoFiltro("local")}
                  aria-checked={tipoFiltro === "local"}
                  role="radio"
                >
                  <Store size={14} aria-hidden="true" />
                  En local
                </button>
                <button
                  type="button"
                  className={`tipo-btn ${tipoFiltro === "domicilio" ? "activo" : ""}`}
                  onClick={() => setTipoFiltro("domicilio")}
                  aria-checked={tipoFiltro === "domicilio"}
                  role="radio"
                >
                  <Bike size={14} aria-hidden="true" />
                  Domicilios
                </button>
              </div>
            </div>

            <div className="rapidos" role="group" aria-label="Rangos rápidos">
              {[
                ["hoy", "Hoy"],
                ["ayer", "Ayer"],
                ["7dias", "7 días"]
              ].map(([tipo, texto]) => (
                <button
                  key={tipo}
                  type="button"
                  className={`rapido${esRango(tipo) ? " activo" : ""}`}
                  aria-pressed={esRango(tipo)}
                  onClick={() => aplicarFiltroRapido(tipo)}
                >
                  {texto}
                </button>
              ))}
            </div>

            <button
              type="submit"
              className="btn btn-primario btn-actualizar"
              disabled={cargando}
            >
              <RefreshCw size={15} aria-hidden="true" />
              {cargando ? "Cargando..." : "Actualizar"}
            </button>
          </form>
        </section>

        {/* Resumen numérico */}
        <section className="cifras no-imprimir" aria-label="Resumen de pedidos cobrados">
          <article className="cifra">
            <span>Total cobrado {tipoFiltro === "local" ? "(Local)" : tipoFiltro === "domicilio" ? "(Domicilio)" : ""}</span>
            <strong>{pesos(totalRecaudado)}</strong>
            <small>
              {tipoFiltro === "todos" && estadisticasDomicilio.cantidad > 0
                ? `Local: ${pesos(estadisticasLocal.total)} · Domicilio: ${pesos(estadisticasDomicilio.total)}`
                : "COP en ventas"}
            </small>
          </article>

          <article className="cifra">
            <span>Pedidos cobrados</span>
            <strong>{cantidadVentas}</strong>
            <small>
              {tipoFiltro === "todos"
                ? `${estadisticasLocal.cantidad} en local · ${estadisticasDomicilio.cantidad} a domicilio`
                : tipoFiltro === "domicilio"
                  ? `${estadisticasDomicilio.cantidad} entregas a domicilio`
                  : `${estadisticasLocal.cantidad} en mostrador`}
            </small>
          </article>

          <article className="cifra">
            <span>Ticket promedio</span>
            <strong>{pesos(promedioVenta)}</strong>
            <small>Por venta cobrada</small>
          </article>

          {estadisticasDomicilio.costoEnvios > 0 && tipoFiltro !== "local" && (
            <article className="cifra">
              <span>Recaudo por envíos</span>
              <strong>{pesos(estadisticasDomicilio.costoEnvios)}</strong>
              <small>Costo de domicilios cobrados</small>
            </article>
          )}
        </section>

        {/* Listado de pedidos con reimpresión de voucher */}
        <section className="tarjeta no-imprimir">
          <div className="herramientas">
            <div className="busqueda">
              <Search size={18} aria-hidden="true" />
              <input
                className="entrada"
                type="search"
                placeholder="Buscar por # pedido, comprobante o producto…"
                aria-label="Buscar pedido"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
          </div>

          <div className="tabla-contenedor tabla-tarjetas-contenedor">
            <table className="tabla tabla-tarjetas">
              <thead>
                <tr>
                  <th>Pedido / Comprobante</th>
                  <th>Fecha y hora</th>
                  <th>Productos</th>
                  <th>Método de pago</th>
                  <th className="num">Total</th>
                  <th>Entrega</th>
                  <th className="num">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pedidosFiltrados.map((pedido) => (
                  <tr key={pedido.venta_id}>
                    <td className="celda-titulo">
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                          <strong>{etiquetaPedido(pedido)}</strong>
                          {pedido.tipo_pedido === "domicilio" ? (
                            <span className="chip chip-naranja" style={{ fontSize: "10px", padding: "1px 6px" }}>
                              🛵 Domicilio
                            </span>
                          ) : (
                            <span className="chip chip-gris" style={{ fontSize: "10px", padding: "1px 6px" }}>
                              Local
                            </span>
                          )}
                          {Number(pedido.cantidad_ediciones) > 0 && (
                            <span className="chip chip-gris" style={{ fontSize: "10px", padding: "1px 6px" }}>
                              ✏️ Modificado
                            </span>
                          )}
                        </div>
                        <small className="caja-comprobante-tag">
                          {pedido.numero_comprobante}
                        </small>
                        {pedido.tipo_pedido === "domicilio" && pedido.nombre_cliente_domicilio && (
                          <div style={{ fontSize: "11px", color: "var(--apagado)", marginTop: "3px", lineHeight: "1.3" }}>
                            👤 {pedido.nombre_cliente_domicilio}
                            {pedido.telefono_domicilio && <span> · 📞 {pedido.telefono_domicilio}</span>}
                            <br />
                            📍 {pedido.direccion_domicilio}{pedido.barrio_domicilio ? ` (${pedido.barrio_domicilio})` : ""}
                          </div>
                        )}
                      </div>
                    </td>
                    <td data-label="Fecha y hora">
                      <span>{formatoFecha(pedido.fecha_venta)}</span>
                    </td>
                    <td data-label="Productos" className="celda-bloque">
                      <div className="caja-resumen-productos">
                        {pedido.productos && pedido.productos.length > 0 ? (
                          pedido.productos.map((prod, idx) => (
                            <div key={idx} className="caja-item-linea">
                              <span>
                                <strong>{prod.cantidad}×</strong> {prod.nombre}
                              </span>
                              {prod.observaciones && (
                                <small className="caja-item-obs">
                                  ({prod.observaciones})
                                </small>
                              )}
                            </div>
                          ))
                        ) : (
                          <span className="apagado">Sin productos</span>
                        )}
                      </div>
                    </td>
                    <td data-label="Pago">
                      <span className="chip chip-pago">
                        {pedido.metodo_pago}
                      </span>
                    </td>
                    <td className="num" data-label="Total">
                      <strong>{pesos(pedido.total)}</strong>
                    </td>
                    <td data-label="Entrega">
                      <span className="chip chip-verde">Completado</span>
                    </td>
                    <td className="num celda-acciones">
                      <div className="caja-acciones">
                        <button
                          type="button"
                          className="btn btn-secundario btn-sm btn-voucher"
                          onClick={() => setComprobanteSeleccionado(pedido)}
                          title="Imprimir voucher de nuevo"
                        >
                          <Printer size={15} aria-hidden="true" />
                          <span>Imprimir voucher</span>
                        </button>

                        {puedeModificar(pedido) && (
                          <>
                            <button
                              type="button"
                              className="btn btn-secundario btn-sm btn-voucher"
                              onClick={() => editarPedido(pedido)}
                              title="Agregar o quitar productos y generar el voucher de nuevo"
                            >
                              <Pencil size={15} aria-hidden="true" />
                              <span>Editar</span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-secundario btn-sm btn-voucher btn-eliminar-pedido"
                              onClick={() => pedirEliminacion(pedido)}
                              title="Eliminar este pedido de los reportes"
                            >
                              <Trash2 size={15} aria-hidden="true" />
                              <span>Eliminar</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}

                {pedidosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan="7" className="vacio">
                      {cargando
                        ? "Consultando pedidos..."
                        : "No se encontraron pedidos en el rango de fechas seleccionado."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="tabla-pie">
            <span>
              Mostrando {pedidosFiltrados.length} de {pedidos.length} pedidos
            </span>
            <span>
              {esAdmin
                ? "Como administrador puedes editar o eliminar pedidos de cualquier día"
                : "Puedes editar o eliminar los pedidos de hoy"}
            </span>
          </div>
        </section>
      </div>

      <ConfirmDialog
        abierto={Boolean(pedidoAEliminar)}
        titulo={pedidoAEliminar ? `¿Eliminar el pedido ${etiquetaPedido(pedidoAEliminar)}?` : ""}
        texto={
          pedidoAEliminar
            ? `Se quitará de los reportes (${pesos(pedidoAEliminar.total)}) y los productos con control de inventario volverán al stock. Esta acción no se puede deshacer.`
            : ""
        }
        confirmar="Sí, eliminar"
        cancelar="No, conservar"
        peligro
        cargando={eliminando}
        onConfirmar={confirmarEliminacion}
        onCancelar={cancelarEliminacion}
      >
        <div className="campo">
          <label htmlFor="motivo-eliminar">Motivo (opcional)</label>
          <input
            id="motivo-eliminar"
            className="entrada"
            type="text"
            maxLength={250}
            placeholder="Ej. El cliente canceló el pedido"
            value={motivoEliminar}
            onChange={(e) => setMotivoEliminar(e.target.value)}
            disabled={eliminando}
          />
        </div>
      </ConfirmDialog>

      {/* Modal de visualización e impresión de voucher */}
      {comprobanteSeleccionado && (
        <ComprobanteModal
          comprobante={comprobanteSeleccionado}
          onCerrar={() => setComprobanteSeleccionado(null)}
          onImpresionRegistrada={actualizarContadorImpresion}
        />
      )}
    </AppShell>
  );
}

