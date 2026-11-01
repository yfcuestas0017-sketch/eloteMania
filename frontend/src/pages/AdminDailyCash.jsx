import { useEffect, useMemo, useState } from "react";
import { Banknote, RefreshCw } from "lucide-react";
import AppShell from "../components/AppShell";
import { fechaLocal, pesos } from "../lib/formato";
import { apiFetch } from "../services/api";
import "./admin.css";
import "./AdminDailyCash.css";

function fechaHora(fecha) {
  if (!fecha) return "—";
  return new Date(fecha).toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

export default function AdminDailyCash() {
  const [fecha, setFecha] = useState(fechaLocal());
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [recargar, setRecargar] = useState(0);

  useEffect(() => {
    if (!fecha) return;
    let cancelado = false;
    async function cargar() {
      setCargando(true);
      setError("");
      try {
        const respuesta = await apiFetch(`/cash-register/admin/dia?fecha=${encodeURIComponent(fecha)}`);
        if (!cancelado) setDatos(respuesta);
      } catch (err) {
        if (!cancelado) setError(err.message);
      } finally {
        if (!cancelado) setCargando(false);
      }
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, [fecha, recargar]);

  const turnos = useMemo(() => datos?.turnos || [], [datos]);

  return (
    <AppShell area="admin" seccion="Caja diaria">
      <div className="pagina">
        <header className="pagina-cabecera">
          <div>
            <h1 className="pagina-titulo">Caja diaria</h1>
            <p className="pagina-sub">Aperturas, pedidos, gastos y cierres por cajero.</p>
          </div>
          <div className="admin-caja-filtros">
            <label className="campo">
              <span>Fecha</span>
              <input
                className="entrada"
                type="date"
                value={fecha}
                onChange={(event) => setFecha(event.target.value)}
              />
            </label>
            <button
              className="btn btn-secundario"
              type="button"
              onClick={() => setRecargar((actual) => actual + 1)}
              disabled={cargando}
            >
              <RefreshCw size={16} aria-hidden="true" />
              Actualizar
            </button>
          </div>
        </header>

        {error && <p className="aviso aviso-error" role="alert">{error}</p>}
        {cargando && <p className="campo-ayuda">Consultando cajas del día…</p>}

        {!cargando && datos && (
          <>
            <section className="cifras admin-caja-cifras">
              <article className="cifra">
                <span>Ingresos de pedidos</span>
                <strong>{pesos(datos.totales.ingresos)}</strong>
                <small>Total registrado en pedidos</small>
              </article>
              <article className="cifra">
                <span>Egresos</span>
                <strong>{pesos(datos.totales.egresos)}</strong>
                <small>Gastos reportados en turnos</small>
              </article>
              <article className="cifra">
                <span>Ganancia neta</span>
                <strong>{pesos(datos.totales.ganancias)}</strong>
                <small>Ingresos menos egresos</small>
              </article>
              <article className="cifra">
                <span>Efectivo dejado en cajas</span>
                <strong>{pesos(datos.totales.efectivo_dejado)}</strong>
                <small>Apertura total {pesos(datos.totales.aperturas)}</small>
              </article>
            </section>

            {!turnos.length && (
              <section className="tarjeta admin-caja-vacia">
                <Banknote size={28} aria-hidden="true" />
                <p>No hay aperturas de caja registradas para esta fecha.</p>
              </section>
            )}

            {turnos.map((turno) => (
              <article className="tarjeta admin-caja-turno" key={turno.turno_id}>
                <header className="admin-caja-turno-cabecera">
                  <div>
                    <h2 className="tarjeta-titulo">{turno.cajero}</h2>
                    <p className="campo-ayuda">
                      Turno #{turno.turno_id} · Apertura {fechaHora(turno.abierta_en)}
                      {turno.cerrada_en ? ` · Cierre ${fechaHora(turno.cerrada_en)}` : " · Sin cerrar"}
                    </p>
                  </div>
                  <span className={`chip ${turno.turno_abierto ? "chip-ambar" : "chip-verde"}`}>
                    {turno.turno_abierto ? "Abierta" : "Cerrada"}
                  </span>
                </header>

                <dl className="admin-caja-detalles">
                  <div><dt>Dinero de apertura</dt><dd>{pesos(turno.monto_apertura)}</dd></div>
                  <div><dt>Pedidos (total)</dt><dd>{pesos(turno.ingresos)}</dd></div>
                  <div><dt>Egresos</dt><dd>{pesos(turno.egresos)}</dd></div>
                  <div><dt>Efectivo esperado</dt><dd>{pesos(turno.efectivo_esperado)}</dd></div>
                  <div><dt>Efectivo contado</dt><dd>{turno.efectivo_contado == null ? "Pendiente" : pesos(turno.efectivo_contado)}</dd></div>
                  <div><dt>Dejado en caja</dt><dd>{turno.monto_dejado_caja == null ? "Pendiente" : pesos(turno.monto_dejado_caja)}</dd></div>
                  <div><dt>Retirado</dt><dd>{pesos(turno.efectivo_retirado)}</dd></div>
                  <div><dt>Diferencia</dt><dd>{turno.diferencia_cierre == null ? "Pendiente" : pesos(turno.diferencia_cierre)}</dd></div>
                  <div><dt>Diferencia de apertura</dt><dd>{pesos(turno.diferencia_apertura)}</dd></div>
                  {turno.observacion_apertura && <div><dt>Nota de apertura</dt><dd>{turno.observacion_apertura}</dd></div>}
                  {turno.observacion_cierre && <div><dt>Nota de cierre</dt><dd>{turno.observacion_cierre}</dd></div>}
                </dl>

                <div className="admin-caja-listas">
                  <section>
                    <h3>Pedidos y pagos</h3>
                    {turno.pedidos_detalle?.length ? (
                      <ul className="admin-caja-lista">
                        {turno.pedidos_detalle.map((pedido) => (
                          <li key={pedido.venta_id}>
                            <span>
                              {pedido.numero_dia ? `Pedido N° ${pedido.numero_dia}` : pedido.pedido}
                              <small>{fechaHora(pedido.fecha)}</small>
                              {pedido.pagos?.map((pago) => (
                                <small key={`${pedido.venta_id}-${pago.metodo_pago}`}>
                                  {pago.metodo_pago}: {pesos(pago.valor)}
                                </small>
                              ))}
                            </span>
                            <strong>{pesos(pedido.total)}</strong>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="campo-ayuda">No hay pedidos asociados a este turno.</p>}
                  </section>
                  <section>
                    <h3>Detalle de egresos</h3>
                    {turno.egresos_detalle?.length ? (
                      <ul className="admin-caja-lista">
                        {turno.egresos_detalle.map((egreso) => (
                          <li key={egreso.egreso_id}>
                            <span>{egreso.descripcion}<small>{fechaHora(egreso.fecha)}</small></span>
                            <strong>{pesos(egreso.valor)}</strong>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="campo-ayuda">No hay egresos en este turno.</p>}
                  </section>
                </div>
              </article>
            ))}
          </>
        )}
      </div>
    </AppShell>
  );
}
