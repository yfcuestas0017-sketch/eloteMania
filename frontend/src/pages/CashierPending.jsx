import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PackageCheck, RefreshCw, Search } from "lucide-react";
import AppShell from "../components/AppShell";
import ConfirmDialog from "../components/ConfirmDialog";
import { apiFetch } from "../services/api";
import { horaCorta, pesos } from "../lib/formato";
import "./admin.css";
import "./CashierPending.css";

export default function CashierPending() {
  const [pedidos, setPedidos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [seleccionado, setSeleccionado] = useState(null);
  const [aEntregar, setAEntregar] = useState(null);
  const [actualizado, setActualizado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [entregando, setEntregando] = useState(false);
  const [error, setError] = useState("");

  async function cargarPedidos() {
    setCargando(true);
    setError("");

    try {
      const datos = await apiFetch("/orders/pendientes-entrega");
      setPedidos(datos);
      setActualizado(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarPedidos();
  }, []);

  async function entregarPedido() {
    if (!aEntregar) return;
    setEntregando(true);

    try {
      await apiFetch(
        `/orders/entregar/${encodeURIComponent(aEntregar.numero_comprobante)}`,
        { method: "PATCH" }
      );

      setAEntregar(null);
      setSeleccionado(null);
      await cargarPedidos();
    } catch (err) {
      setAEntregar(null);
      setError(err.message);
    } finally {
      setEntregando(false);
    }
  }

  const filtrados = useMemo(
    () =>
      pedidos.filter((pedido) =>
        String(pedido.numero_comprobante || "")
          .toLowerCase()
          .includes(busqueda.toLowerCase())
      ),
    [pedidos, busqueda]
  );

  const detalle =
    pedidos.find((p) => p.pedido_id === seleccionado) || filtrados[0] || null;
  const valorTotal = pedidos.reduce((s, p) => s + Number(p.total), 0);

  return (
    <AppShell area="caja" seccion="Despacho">
      <div className="pagina">
        <header className="pagina-cabecera">
          <div>
            <h1 className="pagina-titulo">Del antojo a la entrega</h1>
            <p className="pagina-sub">
              Despacho · Pedidos cobrados
              {actualizado && ` · Actualizado a las ${horaCorta(actualizado)}`}
            </p>
          </div>

          <button
            type="button"
            className="btn btn-secundario"
            onClick={cargarPedidos}
            disabled={cargando}
          >
            <RefreshCw size={16} aria-hidden="true" />
            {cargando ? "Actualizando..." : "Actualizar"}
          </button>
        </header>

        {error && <p className="aviso aviso-error" role="alert">{error}</p>}

        <section className="despacho-cifras" aria-label="Resumen de despacho">
          <article className="despacho-cifra ambar">
            <span>Pendientes</span>
            <strong>{pedidos.length}</strong>
          </article>
          <article className="despacho-cifra">
            <span>Valor por entregar</span>
            <strong>{pesos(valorTotal)}</strong>
          </article>
          <article className="despacho-cifra">
            <span>Más antiguo</span>
            <strong>{pedidos[0] ? horaCorta(pedidos[0].fecha_pedido) : "—"}</strong>
          </article>
        </section>

        <div className="dos-columnas">
          <section className="tarjeta">
            <h2 className="tarjeta-titulo" style={{ marginBottom: 16 }}>
              Pedidos por despachar
            </h2>

            <div className="herramientas">
              <div className="busqueda" style={{ maxWidth: "none" }}>
                <Search size={18} aria-hidden="true" />
                <input
                  className="entrada"
                  type="search"
                  placeholder="Buscar número de comprobante…"
                  aria-label="Buscar comprobante"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
              </div>
            </div>

            <div className="tabla-contenedor">
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Comprobante</th>
                    <th>Hora</th>
                    <th>Cajero</th>
                    <th>Total</th>
                    <th>Estado</th>
                  </tr>
                </thead>

                <tbody>
                  {filtrados.map((pedido) => {
                    const activo = detalle?.pedido_id === pedido.pedido_id;

                    return (
                      <tr
                        key={pedido.pedido_id}
                        className={`fila-elegible${activo ? " activa" : ""}`}
                        onClick={() => setSeleccionado(pedido.pedido_id)}
                      >
                        <td>
                          <button
                            type="button"
                            className="fila-boton"
                            aria-pressed={activo}
                            onClick={() => setSeleccionado(pedido.pedido_id)}
                          >
                            #{pedido.numero_comprobante}
                          </button>
                        </td>
                        <td>{horaCorta(pedido.fecha_pedido)}</td>
                        <td>{pedido.cajero || "No disponible"}</td>
                        <td>{pesos(pedido.total)}</td>
                        <td>
                          <span className="chip chip-ambar">
                            {activo ? "Pendiente · seleccionado" : "Pendiente"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                  {!cargando && filtrados.length === 0 && (
                    <tr>
                      <td colSpan="5" className="vacio">
                        {pedidos.length === 0
                          ? "No hay pedidos pendientes. ¡Todo entregado!"
                          : "Ningún comprobante coincide con la búsqueda."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="tabla-pie">
              <span>
                Los pedidos nuevos se crean desde el <Link to="/caja/ventas" className="btn-enlace">punto de venta</Link>.
              </span>
            </p>
          </section>

          <aside className="tarjeta tarjeta-pila despacho-detalle" aria-live="polite">
            {detalle ? (
              <>
                <div className="despacho-detalle-cabecera">
                  <h2>Comprobante #{detalle.numero_comprobante}</h2>
                  <span className="chip chip-ambar">Pendiente</span>
                </div>

                <p className="campo-ayuda">
                  {new Date(detalle.fecha_pedido).toLocaleString("es-CO")}
                </p>

                <dl className="lista-datos">
                  <div>
                    <dt>Pedido</dt>
                    <dd>{detalle.numero_pedido || `#${detalle.pedido_id}`}</dd>
                  </div>
                  <div>
                    <dt>Cajero</dt>
                    <dd>{detalle.cajero || "No disponible"}</dd>
                  </div>
                  <div className="despacho-total">
                    <dt>Total cobrado</dt>
                    <dd>{pesos(detalle.total)}</dd>
                  </div>
                </dl>

                {detalle.productos?.length > 0 && (
                  <ul className="despacho-productos">
                    {detalle.productos.map((p, i) => (
                      <li key={i}>
                        <strong>
                          {p.tipo_item === "adicional" && "Adicional · "}
                          {Number(p.cantidad)} × {p.nombre}
                        </strong>
                        {p.observaciones && (
                          <div style={{ color: "#b45309", fontSize: 13 }}>
                            ⚠ {p.observaciones}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                <p className="despacho-aviso">
                  Verifica el número del comprobante y entrega los productos al cliente.
                  Este pedido ya está pagado.
                </p>

                <button
                  type="button"
                  className="btn btn-primario btn-bloque"
                  onClick={() => setAEntregar(detalle)}
                >
                  <PackageCheck size={16} aria-hidden="true" />
                  Marcar entregado
                </button>
              </>
            ) : (
              <p className="vacio">Selecciona un pedido para ver su detalle.</p>
            )}
          </aside>
        </div>
      </div>

      <ConfirmDialog
        abierto={Boolean(aEntregar)}
        titulo={`¿Entregaste el pedido #${aEntregar?.numero_comprobante}?`}
        texto="Se marcará como entregado y saldrá de la lista de pendientes."
        confirmar="Sí, entregado"
        cargando={entregando}
        onConfirmar={entregarPedido}
        onCancelar={() => setAEntregar(null)}
      />
    </AppShell>
  );
}
