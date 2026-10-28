import { useEffect, useMemo, useState } from "react";
import {
  Award,
  BarChart3,
  Bike,
  Check,
  ChevronRight,
  Flame,
  Printer,
  RefreshCw,
  ShoppingBag,
  Store,
  TrendingUp,
  UserCheck,
  Users,
  X
} from "lucide-react";
import AppShell from "../components/AppShell";
import ComprobanteModal from "../components/ComprobanteModal";
import GraficaVentas from "../components/GraficaVentas";
import HistorialDia from "../components/HistorialDia";
import { etiquetaPedido, fechaLocal, pesos } from "../lib/formato";
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
  const [puntoGrafica, setPuntoGrafica] = useState(null); // día u hora elegidos en la gráfica
  const [tipoFiltro, setTipoFiltro] = useState("todos"); // "todos" | "local" | "domicilio"

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
    const filtroTipo = tipoFiltro !== "todos" ? `&tipo_pedido=${tipoFiltro}` : "";

    try {
      const [datosResumen, datosCajeros, datosProductos, datosPedidos] =
        await Promise.all([
          apiFetch(`/reports/resumen?${rangoBase}${filtroCajero}${filtroTipo}`),
          apiFetch(`/reports/ventas-por-cajero?${rangoBase}${filtroTipo}`),
          apiFetch(`/reports/productos-mas-vendidos?${rangoBase}${filtroCajero}&limite=10${filtroTipo}`),
          apiFetch(`/reports/pedidos-cajero?${rangoBase}${filtroCajero}${filtroTipo}`)
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
  }, [desde, hasta, cajeroSeleccionado, tipoFiltro]);

  function rangoRapido(tipo) {
    const ahora = new Date();
    if (tipo === "semana") {
      const d = new Date();
      d.setDate(ahora.getDate() - 6);
      return [fechaLocal(d), hoy];
    }
    if (tipo === "mes") {
      return [fechaLocal(new Date(ahora.getFullYear(), ahora.getMonth(), 1)), hoy];
    }
    if (tipo === "mesanterior") {
      return [
        fechaLocal(new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)),
        fechaLocal(new Date(ahora.getFullYear(), ahora.getMonth(), 0))
      ];
    }
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

  // El punto elegido solo vale mientras no cambien las fechas ni el cajero.
  const huellaFiltro = `${desde}|${hasta}|${cajeroSeleccionado?.usuario_id ?? "todos"}|${tipoFiltro}`;
  const historialDia = puntoGrafica?.huella === huellaFiltro ? puntoGrafica : null;

  function elegirPuntoGrafica(punto) {
    setPuntoGrafica({ ...punto, huella: huellaFiltro });
    requestAnimationFrame(() => {
      document.getElementById("seccion-pedidos")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
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
                ["semana", "7 días"],
                ["mes", "Este mes"],
                ["mesanterior", "Mes anterior"]
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
              <span>
                {cajeroSeleccionado
                  ? "Recaudo de este cajero"
                  : tipoFiltro === "local"
                    ? "Recaudo en local"
                    : tipoFiltro === "domicilio"
                      ? "Recaudo en domicilios"
                      : "Total recaudado"}
              </span>
              <strong>{pesos(resumen.total_recaudado)}</strong>
              <small>
                {tipoFiltro === "todos" && Number(resumen.cantidad_domicilio) > 0
                  ? `Local: ${pesos(resumen.total_local)} · Domicilio: ${pesos(resumen.total_domicilio)}`
                  : "COP en ventas vigentes"}
              </small>
            </article>

            <article className="cifra">
              <span>Pedidos cobrados</span>
              <strong>{resumen.cantidad_ventas}</strong>
              <small>
                {tipoFiltro === "todos"
                  ? `${resumen.cantidad_local || 0} en local · ${resumen.cantidad_domicilio || 0} domicilios`
                  : tipoFiltro === "domicilio"
                    ? `${resumen.cantidad_domicilio || 0} entregas a domicilio`
                    : `${resumen.cantidad_local || 0} ventas en local`}
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

        {/* Gráfica de ventas por día: clic en un punto = historial de ese día */}
        {/* Comparativa visual de canales: Local vs Domicilio */}
        {resumen && Number(resumen.cantidad_ventas) > 0 && (
          <section className="tarjeta comparativa-canales-tarjeta no-imprimir">
            <div className="tarjeta-cabecera-accion">
              <div className="cabecera-acciones-lado">
                <ShoppingBag size={20} color="#ea580c" aria-hidden="true" />
                <h2 className="tarjeta-titulo">Distribución: Ventas en local vs Domicilios</h2>
              </div>
              <span className="chip chip-verde">
                {resumen.cantidad_ventas} pedidos totales · {pesos(resumen.total_recaudado)}
              </span>
            </div>

            <div className="comparativa-canales-grid">
              <div
                className={`canal-tarjeta ${tipoFiltro === "local" ? "activa" : ""}`}
                onClick={() => setTipoFiltro(tipoFiltro === "local" ? "todos" : "local")}
                role="button"
                tabIndex={0}
                title="Clic para filtrar solo ventas en local"
              >
                <div className="canal-tarjeta-cab">
                  <div className="canal-icono local">
                    <Store size={22} />
                  </div>
                  <div>
                    <strong>Ventas en mostrador / local</strong>
                    <small>{resumen.cantidad_local || 0} pedidos cobrados</small>
                  </div>
                </div>
                <div className="canal-tarjeta-monto">
                  <strong>{pesos(resumen.total_local || 0)}</strong>
                  <span>
                    {Number(resumen.total_recaudado) > 0
                      ? Math.round((Number(resumen.total_local || 0) / Number(resumen.total_recaudado)) * 100)
                      : 0}% del recaudo
                  </span>
                </div>
                <div className="canal-barra-progreso">
                  <div
                    className="canal-barra-relleno local"
                    style={{
                      width: `${Number(resumen.total_recaudado) > 0 ? (Number(resumen.total_local || 0) / Number(resumen.total_recaudado)) * 100 : 0}%`
                    }}
                  />
                </div>
              </div>

              <div
                className={`canal-tarjeta ${tipoFiltro === "domicilio" ? "activa" : ""}`}
                onClick={() => setTipoFiltro(tipoFiltro === "domicilio" ? "todos" : "domicilio")}
                role="button"
                tabIndex={0}
                title="Clic para filtrar solo pedidos a domicilio"
              >
                <div className="canal-tarjeta-cab">
                  <div className="canal-icono domicilio">
                    <Bike size={22} />
                  </div>
                  <div>
                    <strong>Pedidos a domicilio</strong>
                    <small>{resumen.cantidad_domicilio || 0} pedidos entregados</small>
                  </div>
                </div>
                <div className="canal-tarjeta-monto">
                  <strong>{pesos(resumen.total_domicilio || 0)}</strong>
                  <span>
                    {Number(resumen.total_recaudado) > 0
                      ? Math.round((Number(resumen.total_domicilio || 0) / Number(resumen.total_recaudado)) * 100)
                      : 0}% del recaudo
                  </span>
                </div>
                <div className="canal-barra-progreso">
                  <div
                    className="canal-barra-relleno domicilio"
                    style={{
                      width: `${Number(resumen.total_recaudado) > 0 ? (Number(resumen.total_domicilio || 0) / Number(resumen.total_recaudado)) * 100 : 0}%`
                    }}
                  />
                </div>
                {Number(resumen.total_costo_domicilio) > 0 && (
                  <div className="canal-sub-envio">
                    🛵 Incluye <strong>{pesos(resumen.total_costo_domicilio)}</strong> recaudados por costo de envío
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        <GraficaVentas
          key={huellaFiltro}
          pedidos={pedidosRecientes}
          desde={desde}
          hasta={hasta}
          cargando={cargando}
          titulo={
            (cajeroSeleccionado
              ? `${cajeroSeleccionado.nombres} ${cajeroSeleccionado.apellidos || ""}`.trim()
              : "Todos los cajeros") +
            (tipoFiltro === "local" ? " · En local" : tipoFiltro === "domicilio" ? " · Domicilios" : "")
          }
          seleccion={historialDia?.clave ?? null}
          onSeleccionar={elegirPuntoGrafica}
        />

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
                      <span>
                        {cajero.cantidad_ventas} pedidos cobrados
                        {tipoFiltro === "todos" && (cajero.ventas_domicilio > 0 || cajero.ventas_local > 0) && (
                          <span style={{ color: "var(--apagado)", marginLeft: 6 }}>
                            ({cajero.ventas_local || 0} local · {cajero.ventas_domicilio || 0} dom.)
                          </span>
                        )}
                      </span>
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

        {/* Si hay un punto elegido en la gráfica, su historial ocupa este mismo lugar */}
        {historialDia ? (
          <HistorialDia
            seleccion={historialDia}
            nombreCajero={
              cajeroSeleccionado
                ? `${cajeroSeleccionado.nombres} ${cajeroSeleccionado.apellidos || ""}`.trim()
                : ""
            }
            onCerrar={() => setPuntoGrafica(null)}
            onVerComprobante={setComprobanteSeleccionado}
          />
        ) : (
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
        )}
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
