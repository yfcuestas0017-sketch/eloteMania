import { useEffect, useMemo, useState } from "react";
import {
  Award,
  BarChart3,
  Check,
  ChevronRight,
  Flame,
  Printer,
  RefreshCw,
  ShoppingBag,
  TrendingUp,
  UserCheck,
  Users,
  X
} from "lucide-react";
import AppShell from "../components/AppShell";
import ComprobanteModal from "../components/ComprobanteModal";
import { fechaLocal, pesos } from "../lib/formato";
import { apiFetch } from "../services/api";
import "./admin.css";
import "./CashierReports.css";
import "./AdminReports.css";

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

export default function AdminReports() {
  const hoy = fechaLocal();

  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [cajeroSeleccionado, setCajeroSeleccionado] = useState(null); // null = todos
  const [resumen, setResumen] = useState(null);
  const [cajeros, setCajeros] = useState([]);
  const [productosMasVendidos, setProductosMasVendidos] = useState([]);
  const [pedidosRecientes, setPedidosRecientes] = useState([]);
  const [metricaProductos, setMetricaProductos] = useState("unidades"); // "unidades" | "dinero"
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [comprobanteSeleccionado, setComprobanteSeleccionado] = useState(null);

  async function consultar(event) {
    if (event) event.preventDefault();

    if (!desde || !hasta || desde > hasta) {
      setError("Selecciona un rango de fechas válido.");
      return;
    }

    setError("");
    setCargando(true);

    const rangoBase = `desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`;
    const filtroCajero = cajeroSeleccionado
      ? `&cajero_id=${encodeURIComponent(cajeroSeleccionado.usuario_id)}`
      : "";

    try {
      const [datosResumen, datosCajeros, datosProductos, datosPedidos] =
        await Promise.all([
          apiFetch(`/reports/resumen?${rangoBase}${filtroCajero}`),
          apiFetch(`/reports/ventas-por-cajero?${rangoBase}`),
          apiFetch(`/reports/productos-mas-vendidos?${rangoBase}${filtroCajero}&limite=10`),
          apiFetch(`/reports/pedidos-cajero?${rangoBase}${filtroCajero}`)
        ]);

      setResumen(datosResumen);
      setCajeros(datosCajeros || []);
      setProductosMasVendidos(datosProductos || []);
      setPedidosRecientes(datosPedidos || []);
    } catch (err) {
      setError(err.message || "Error al consultar los reportes.");
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    consultar();
  }, [desde, hasta, cajeroSeleccionado]);

  function aplicarFiltroRapido(tipo) {
    const ahora = new Date();
    if (tipo === "hoy") {
      setDesde(hoy);
      setHasta(hoy);
    } else if (tipo === "semana") {
      const sieteDias = new Date();
      sieteDias.setDate(ahora.getDate() - 6);
      setDesde(sieteDias.toISOString().slice(0, 10));
      setHasta(hoy);
    } else if (tipo === "mes") {
      const primerDiaMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
      setDesde(primerDiaMes.toISOString().slice(0, 10));
      setHasta(hoy);
    }
  }

  function alternarCajero(cajero) {
    if (cajeroSeleccionado?.usuario_id === cajero.usuario_id) {
      setCajeroSeleccionado(null);
    } else {
      setCajeroSeleccionado(cajero);
      // Desplazar suavemente a los pedidos del cajero
      const seccionPedidos = document.getElementById("seccion-pedidos");
      if (seccionPedidos) {
        seccionPedidos.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  // Cálculos de ventas por cajero
  const totalGeneralCajeros = useMemo(() => {
    return cajeros.reduce((acc, c) => acc + Number(c.total_recaudado || 0), 0);
  }, [cajeros]);

  const maxVentaCajero = useMemo(() => {
    return Math.max(...cajeros.map((c) => Number(c.total_recaudado || 0)), 1);
  }, [cajeros]);

  // Cálculos para la gráfica de productos más vendidos
  const maxUnidadesProducto = useMemo(() => {
    return Math.max(
      ...productosMasVendidos.map((p) => Number(p.cantidad_vendida || 0)),
      1
    );
  }, [productosMasVendidos]);

  const maxDineroProducto = useMemo(() => {
    return Math.max(
      ...productosMasVendidos.map((p) => Number(p.total_recaudado || 0)),
      1
    );
  }, [productosMasVendidos]);

  const productoTop = productosMasVendidos[0] || null;

  return (
    <AppShell area="admin" seccion="Reportes">
      <div className="pagina">
        <header className="pagina-cabecera no-imprimir">
          <div>
            <h1 className="pagina-titulo">Reportes y estadísticas</h1>
            <p className="pagina-sub">
              Rendimiento del negocio, ventas por cajero y productos más vendidos con gráficas.
            </p>
          </div>
        </header>

        {error && <p className="aviso aviso-error" role="alert">{error}</p>}

        {/* Filtros de fecha y selector de cajero */}
        <section className="tarjeta no-imprimir">
          <form onSubmit={consultar} className="filtros-reporte">
            <div className="campo">
              <label htmlFor="r-desde">Desde</label>
              <input
                id="r-desde"
                className="entrada"
                type="date"
                value={desde}
                max={hasta}
                onChange={(e) => setDesde(e.target.value)}
                required
              />
            </div>

            <div className="campo">
              <label htmlFor="r-hasta">Hasta</label>
              <input
                id="r-hasta"
                className="entrada"
                type="date"
                value={hasta}
                min={desde}
                max={hoy}
                onChange={(e) => setHasta(e.target.value)}
                required
              />
            </div>

            <div className="campo campo-cajero">
              <label htmlFor="r-cajero">Filtrar por cajero</label>
              <select
                id="r-cajero"
                className="seleccion"
                value={cajeroSeleccionado ? cajeroSeleccionado.usuario_id : ""}
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) {
                    setCajeroSeleccionado(null);
                  } else {
                    const c = cajeros.find((item) => String(item.usuario_id) === String(id));
                    if (c) setCajeroSeleccionado(c);
                  }
                }}
              >
                <option value="">Todos los cajeros (General)</option>
                {cajeros.map((c) => (
                  <option key={c.usuario_id} value={c.usuario_id}>
                    {c.nombres} {c.apellidos || ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="caja-botones-rapidos">
              <button
                type="button"
                className={`btn btn-secundario btn-sm ${desde === hoy && hasta === hoy ? "activo" : ""}`}
                onClick={() => aplicarFiltroRapido("hoy")}
              >
                Hoy
              </button>
              <button
                type="button"
                className="btn btn-secundario btn-sm"
                onClick={() => aplicarFiltroRapido("semana")}
              >
                Últimos 7 días
              </button>
              <button
                type="button"
                className="btn btn-secundario btn-sm"
                onClick={() => aplicarFiltroRapido("mes")}
              >
                Este mes
              </button>
            </div>

            <button
              type="submit"
              className="btn btn-primario"
              disabled={cargando}
            >
              <RefreshCw size={15} aria-hidden="true" />
              {cargando ? "Actualizando..." : "Actualizar"}
            </button>
          </form>
        </section>

        {/* Banner Informativo si se seleccionó un cajero específico */}
        {cajeroSeleccionado && (
          <section className="banner-cajero-activo no-imprimir">
            <div className="banner-cajero-info">
              <div className="banner-cajero-avatar">
                {cajeroSeleccionado.nombres?.[0] || "C"}
              </div>
              <div className="banner-cajero-titulos">
                <h2>
                  Viendo todo lo vendido por: {cajeroSeleccionado.nombres}{" "}
                  {cajeroSeleccionado.apellidos || ""}
                </h2>
                <p>
                  Mostrando únicamente las ventas cobradas por este cajero en las cifras,
                  gráfica y tabla inferior.
                </p>
              </div>
            </div>

            <div className="banner-cajero-cifras">
              <div className="cifra-pildora">
                <span>Total recaudado</span>
                <strong>{pesos(resumen?.total_recaudado)}</strong>
              </div>
              <div className="cifra-pildora">
                <span>Pedidos cobrados</span>
                <strong>{resumen?.cantidad_ventas ?? 0}</strong>
              </div>
              <button
                type="button"
                className="btn btn-secundario btn-sm"
                onClick={() => setCajeroSeleccionado(null)}
              >
                <X size={15} aria-hidden="true" />
                Ver todos los cajeros
              </button>
            </div>
          </section>
        )}

        {/* Tarjetas de Cifras Clave */}
        {resumen && (
          <section className="cifras no-imprimir" aria-label="Cifras clave del período">
            <article className="cifra">
              <span>{cajeroSeleccionado ? "Recaudo de este cajero" : "Total recaudado"}</span>
              <strong>{pesos(resumen.total_recaudado)}</strong>
              <small>COP en ventas vigentes</small>
            </article>

            <article className="cifra">
              <span>Pedidos cobrados</span>
              <strong>{resumen.cantidad_ventas}</strong>
              <small>
                {cajeroSeleccionado ? "Por este cajero" : "En total por el equipo"}
              </small>
            </article>

            <article className="cifra">
              <span>Promedio por venta</span>
              <strong>{pesos(resumen.promedio_venta)}</strong>
              <small>Ticket promedio</small>
            </article>

            <article className="cifra">
              <span>Producto estrella</span>
              <strong>{productoTop ? productoTop.nombre_producto : "—"}</strong>
              <small>
                {productoTop
                  ? `${Math.round(productoTop.cantidad_vendida)} uds · ${pesos(productoTop.total_recaudado)}`
                  : "Sin ventas"}
              </small>
            </article>
          </section>
        )}

        {/* Sección de Gráficas: Ventas por cajero y Productos más vendidos */}
        <div className="reportes-secciones-grid no-imprimir">
          {/* GRÁFICA 1: VENTAS POR CAJERO (CON INTERACCIÓN AL DAR CLICK) */}
          <section className="tarjeta">
            <div className="tarjeta-cabecera-accion">
              <div className="cabecera-acciones-lado">
                <Users size={20} color="#d50918" aria-hidden="true" />
                <h2 className="tarjeta-titulo">Ventas por cada cajero</h2>
              </div>
              <span className="chip chip-verde">{cajeros.length} cajeros</span>
            </div>

            <p className="campo-ayuda" style={{ marginBottom: 12 }}>
              💡 <strong>Haz clic en cualquier cajero</strong> para filtrar y ver todo lo que ha vendido.
            </p>

            <div className="grafica-contenedor">
              {cajeros.map((cajero, index) => {
                const totalCajero = Number(cajero.total_recaudado || 0);
                const porcentajeRelativo = (totalCajero / maxVentaCajero) * 100;
                const participacionGlobal =
                  totalGeneralCajeros > 0
                    ? Math.round((totalCajero / totalGeneralCajeros) * 100)
                    : 0;

                const estaSeleccionado =
                  cajeroSeleccionado?.usuario_id === cajero.usuario_id;

                const claseColor =
                  index === 0
                    ? "cajero-0"
                    : index === 1
                      ? "cajero-1"
                      : index === 2
                        ? "cajero-2"
                        : "cajero-default";

                return (
                  <div
                    key={cajero.usuario_id}
                    className={`barra-item cajero-item-clickeable ${
                      estaSeleccionado ? "seleccionado" : ""
                    }`}
                    onClick={() => alternarCajero(cajero)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && alternarCajero(cajero)}
                    title={`Haz clic para ver las ventas de ${cajero.nombres}`}
                  >
                    <div className="barra-info">
                      <div className="barra-titulo">
                        <span className={`barra-posicion ${index === 0 ? "top-1" : ""}`}>
                          {index + 1}
                        </span>
                        <strong>
                          {cajero.nombres} {cajero.apellidos || ""}
                        </strong>
                        {estaSeleccionado ? (
                          <span className="chip chip-verde" style={{ fontSize: 10 }}>
                            <Check size={11} aria-hidden="true" /> Seleccionado
                          </span>
                        ) : (
                          <span className="campo-ayuda" style={{ fontSize: 11 }}>
                            (Click para ver ventas)
                          </span>
                        )}
                      </div>
                      <span className="barra-valor">{pesos(totalCajero)}</span>
                    </div>

                    <div className="barra-pista">
                      <div
                        className={`barra-relleno ${claseColor}`}
                        style={{ width: `${Math.max(porcentajeRelativo, 4)}%` }}
                      />
                    </div>

                    <div className="barra-sub">
                      <span>{cajero.cantidad_ventas} pedidos cobrados</span>
                      <strong>{participacionGlobal}% del total</strong>
                    </div>
                  </div>
                );
              })}

              {cajeros.length === 0 && (
                <p className="vacio">No hay ventas registradas por ningún cajero en este período.</p>
              )}
            </div>

            {/* Tabla complementaria con filas clickeables */}
            {cajeros.length > 0 && (
              <div className="tabla-contenedor tabla-tarjetas-contenedor" style={{ marginTop: 20 }}>
                <table className="tabla tabla-tarjetas">
                  <thead>
                    <tr>
                      <th>Cajero</th>
                      <th className="num">Ventas</th>
                      <th className="num">Recaudo</th>
                      <th className="num">Part.</th>
                      <th className="num">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cajeros.map((cajero) => {
                      const activa =
                        cajeroSeleccionado?.usuario_id === cajero.usuario_id;
                      return (
                        <tr
                          key={cajero.usuario_id}
                          className={`fila-tabla-clickeable ${activa ? "activa" : ""}`}
                          onClick={() => alternarCajero(cajero)}
                        >
                          <td className="celda-titulo">
                            <strong>
                              {cajero.nombres} {cajero.apellidos}
                            </strong>
                          </td>
                          <td className="num" data-label="Ventas">{cajero.cantidad_ventas}</td>
                          <td className="num" data-label="Recaudo">{pesos(cajero.total_recaudado)}</td>
                          <td className="num" data-label="Participación">
                            {totalGeneralCajeros > 0
                              ? `${Math.round((Number(cajero.total_recaudado) / totalGeneralCajeros) * 100)}%`
                              : "—"}
                          </td>
                          <td className="num celda-acciones">
                            <button
                              type="button"
                              className={`btn btn-sm ${activa ? "btn-primario" : "btn-secundario"}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                alternarCajero(cajero);
                              }}
                            >
                              {activa ? "Viendo" : "Ver ventas"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* GRÁFICA 2: PRODUCTOS MÁS VENDIDOS */}
          <section className="tarjeta">
            <div className="tarjeta-cabecera-accion">
              <div className="cabecera-acciones-lado">
                <Flame size={20} color="#ea580c" aria-hidden="true" />
                <h2 className="tarjeta-titulo">
                  {cajeroSeleccionado
                    ? `Productos vendidos por ${cajeroSeleccionado.nombres}`
                    : "Productos más vendidos"}
                </h2>
              </div>

              <div className="selector-pildoras" role="tablist">
                <button
                  type="button"
                  className={metricaProductos === "unidades" ? "activa" : ""}
                  onClick={() => setMetricaProductos("unidades")}
                >
                  Por unidades
                </button>
                <button
                  type="button"
                  className={metricaProductos === "dinero" ? "activa" : ""}
                  onClick={() => setMetricaProductos("dinero")}
                >
                  Por recaudación
                </button>
              </div>
            </div>

            <p className="campo-ayuda" style={{ marginBottom: 12 }}>
              {cajeroSeleccionado
                ? `Artículos despachados exclusivamente en las ventas de ${cajeroSeleccionado.nombres}.`
                : "Ranking de los artículos con mayor rotación en el negocio."}
            </p>

            <div className="grafica-contenedor">
              {productosMasVendidos.map((prod, index) => {
                const unidades = Number(prod.cantidad_vendida || 0);
                const dinero = Number(prod.total_recaudado || 0);
                const porcentajeBarra =
                  metricaProductos === "unidades"
                    ? (unidades / maxUnidadesProducto) * 100
                    : (dinero / maxDineroProducto) * 100;

                const claseTop =
                  index === 0 ? "top-1" : index === 1 ? "top-2" : index === 2 ? "top-3" : "";

                return (
                  <div key={prod.producto_id || index} className="barra-item">
                    <div className="barra-info">
                      <div className="barra-titulo">
                        <span className={`barra-posicion ${claseTop}`}>
                          {index + 1}
                        </span>
                        <span>{prod.nombre_producto}</span>
                        <span className="chip" style={{ fontSize: 10, padding: "2px 6px" }}>
                          {prod.categoria}
                        </span>
                      </div>
                      <span className="barra-valor">
                        {metricaProductos === "unidades"
                          ? `${Math.round(unidades)} uds`
                          : pesos(dinero)}
                      </span>
                    </div>

                    <div className="barra-pista">
                      <div
                        className="barra-relleno producto"
                        style={{ width: `${Math.max(porcentajeBarra, 4)}%` }}
                      />
                    </div>

                    <div className="barra-sub">
                      <span>
                        {metricaProductos === "unidades"
                          ? `Total: ${pesos(dinero)}`
                          : `${Math.round(unidades)} unidades vendidas`}
                      </span>
                      <span>
                        {totalGeneralCajeros > 0
                          ? `${Math.round((dinero / (cajeroSeleccionado ? Number(resumen?.total_recaudado || 1) : totalGeneralCajeros)) * 100)}% de sus ventas`
                          : ""}
                      </span>
                    </div>
                  </div>
                );
              })}

              {productosMasVendidos.length === 0 && (
                <p className="vacio">No hay ventas de productos registradas en este período.</p>
              )}
            </div>
          </section>
        </div>

        {/* Sección de Historial de Pedidos y Reimpresión de Voucher */}
        <section id="seccion-pedidos" className="tarjeta no-imprimir">
          <div className="tarjeta-cabecera-accion">
            <div>
              <h2 className="tarjeta-titulo">
                {cajeroSeleccionado
                  ? `Todo lo vendido por ${cajeroSeleccionado.nombres} ${cajeroSeleccionado.apellidos || ""}`
                  : "Historial de todos los pedidos del período"}
              </h2>
              <p className="campo-ayuda">
                {cajeroSeleccionado
                  ? `Mostrando únicamente los pedidos cobrados por este cajero. Haz clic en "Imprimir" para ver el voucher.`
                  : `Consulta los pedidos de cualquier cajero y reimprime su voucher.`}
              </p>
            </div>
            <div className="cabecera-acciones-lado">
              {cajeroSeleccionado && (
                <button
                  type="button"
                  className="btn btn-secundario btn-sm"
                  onClick={() => setCajeroSeleccionado(null)}
                >
                  <X size={14} aria-hidden="true" />
                  Quitar filtro de cajero
                </button>
              )}
              <span className="chip">{pedidosRecientes.length} pedidos</span>
            </div>
          </div>

          <div className="tabla-contenedor tabla-tarjetas-contenedor">
            <table className="tabla tabla-tarjetas">
              <thead>
                <tr>
                  <th>Pedido / Comprobante</th>
                  <th>Fecha y hora</th>
                  <th>Cajero</th>
                  <th>Productos vendidos</th>
                  <th>Método</th>
                  <th className="num">Total</th>
                  <th className="num">Acción</th>
                </tr>
              </thead>
              <tbody>
                {pedidosRecientes.map((pedido) => (
                  <tr key={pedido.venta_id}>
                    <td className="celda-titulo">
                      <div>
                        <strong>{pedido.numero_pedido}</strong>
                        <br />
                        <small className="caja-comprobante-tag">
                          {pedido.numero_comprobante}
                        </small>
                      </div>
                    </td>
                    <td data-label="Fecha y hora">
                      <span>{formatoFecha(pedido.fecha_venta)}</span>
                    </td>
                    <td data-label="Cajero">
                      <button
                        type="button"
                        className="btn-enlace"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          color: "inherit",
                          fontWeight: 700,
                          textAlign: "left"
                        }}
                        onClick={() => {
                          const c = cajeros.find(
                            (item) => String(item.usuario_id) === String(pedido.cajero_id)
                          );
                          if (c) alternarCajero(c);
                        }}
                        title="Haz clic para filtrar por este cajero"
                      >
                        {pedido.cajero}
                      </button>
                    </td>
                    <td data-label="Productos vendidos" className="celda-bloque">
                      <div className="caja-resumen-productos">
                        {pedido.productos && pedido.productos.length > 0 ? (
                          pedido.productos.map((prod, idx) => (
                            <span key={idx} className="caja-item-linea">
                              <strong>{prod.cantidad}×</strong> {prod.nombre}
                              {prod.observaciones && (
                                <small className="caja-item-obs"> ({prod.observaciones})</small>
                              )}
                            </span>
                          ))
                        ) : (
                          <span className="apagado">—</span>
                        )}
                      </div>
                    </td>
                    <td data-label="Método">
                      <span className="chip chip-pago">{pedido.metodo_pago}</span>
                    </td>
                    <td className="num" data-label="Total">
                      <strong>{pesos(pedido.total)}</strong>
                    </td>
                    <td className="num celda-acciones">
                      <button
                        type="button"
                        className="btn btn-secundario btn-sm btn-voucher"
                        onClick={() => setComprobanteSeleccionado(pedido)}
                        title="Ver y reimprimir voucher"
                      >
                        <Printer size={15} aria-hidden="true" />
                        <span>Imprimir</span>
                      </button>
                    </td>
                  </tr>
                ))}

                {pedidosRecientes.length === 0 && (
                  <tr>
                    <td colSpan="7" className="vacio">
                      {cajeroSeleccionado
                        ? `No hay pedidos cobrados por ${cajeroSeleccionado.nombres} en este rango de fechas.`
                        : "No hay pedidos en este rango de fechas."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Modal para ver y reimprimir voucher */}
      {comprobanteSeleccionado && (
        <ComprobanteModal
          comprobante={comprobanteSeleccionado}
          onCerrar={() => setComprobanteSeleccionado(null)}
          onImpresionRegistrada={(id, nuevoTotal) => {
            setPedidosRecientes((prev) =>
              prev.map((p) =>
                p.comprobante_id === id
                  ? { ...p, cantidad_impresiones: nuevoTotal }
                  : p
              )
            );
          }}
        />
      )}
    </AppShell>
  );
}
