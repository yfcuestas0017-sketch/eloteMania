import { useEffect, useState } from "react";
import { Banknote, ClipboardList, PackageCheck, ReceiptText } from "lucide-react";
import AppShell from "../components/AppShell";
import { fechaLarga, pesos } from "../lib/formato";
import { apiFetch } from "../services/api";
import "./admin.css";
import "./CashierCashRegister.css";

function fechaCaja(fecha) {
  if (!fecha) return "esa fecha";
  return new Date(`${fecha}T12:00:00`).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

export default function CashierCashRegister() {
  const [resumen, setResumen] = useState(null);
  const [inventario, setInventario] = useState(null);
  const [apertura, setApertura] = useState("");
  const [observacionApertura, setObservacionApertura] = useState("");
  const [efectivoContado, setEfectivoContado] = useState("");
  const [montoDejadoCaja, setMontoDejadoCaja] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [valorEgreso, setValorEgreso] = useState("");
  const [cantidades, setCantidades] = useState({});
  const [observaciones, setObservaciones] = useState({});
  const [observacionCierre, setObservacionCierre] = useState("");
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [recargar, setRecargar] = useState(0);

  useEffect(() => {
    let cancelado = false;
    async function cargarDatos() {
      try {
        const [estado, stock] = await Promise.all([
          apiFetch("/cash-register/resumen"),
          apiFetch("/cash-register/inventario")
        ]);
        if (cancelado) return;
        setResumen(estado);
        setInventario(stock);
        if (estado.apertura_sugerida != null) {
          setApertura(String(estado.apertura_sugerida));
        }
        if (estado.turno) {
          const efectivoBase = String(estado.efectivo_esperado ?? "");
          setEfectivoContado(efectivoBase);
          setMontoDejadoCaja(efectivoBase);
        }
        setCantidades(Object.fromEntries(
          stock.productos.map((producto) => [
            producto.producto_id,
            String(producto.cantidad_contada ?? producto.stock_esperado)
          ])
        ));
        setObservaciones(Object.fromEntries(
          stock.productos.map((producto) => [
            producto.producto_id,
            producto.observacion || ""
          ])
        ));
      } catch (err) {
        if (!cancelado) setError(err.message);
      } finally {
        if (!cancelado) setCargando(false);
      }
    }

    cargarDatos();
    return () => {
      cancelado = true;
    };
  }, [recargar]);

  async function guardar(accion, cuerpo, mensajeExito) {
    setError("");
    setExito("");
    setGuardando(true);
    try {
      await apiFetch(accion, {
        method: "POST",
        body: JSON.stringify(cuerpo)
      });
      setExito(mensajeExito);
      setRecargar((actual) => actual + 1);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setGuardando(false);
    }
  }

  function abrirCaja(event) {
    event.preventDefault();
    guardar(
      "/cash-register/abrir",
      {
        monto_apertura: Number(apertura),
        observacion: observacionApertura
      },
      "Caja abierta correctamente."
    );
  }

  async function registrarEgreso(event) {
    event.preventDefault();
    const registrado = await guardar(
      "/cash-register/egresos",
      { descripcion, valor: Number(valorEgreso) },
      "Gasto registrado."
    );
    if (registrado) {
      setDescripcion("");
      setValorEgreso("");
    }
  }

  function cerrarCaja(event) {
    event.preventDefault();
    guardar(
      "/cash-register/cerrar",
      {
        turno_id: resumen.turno.turno_id,
        efectivo_contado: Number(efectivoContado),
        monto_dejado_caja: Number(montoDejadoCaja),
        observacion: observacionCierre
      },
      "Cierre de caja registrado."
    );
  }

  function guardarConteo(event) {
    event.preventDefault();
    guardar(
      "/cash-register/inventario/conteo",
      {
        productos: inventario.productos.map((producto) => ({
          producto_id: producto.producto_id,
          cantidad_contada: Number(cantidades[producto.producto_id]),
          observacion: observaciones[producto.producto_id] || ""
        }))
      },
      "Conteo de inventario registrado."
    );
  }

  const turnoAbierto = Boolean(resumen?.turno_abierto);
  const conteoHecho = Boolean(inventario?.conteo);

  return (
    <AppShell area="caja" seccion="Cuenta e inventario">
      <div className="pagina">
        <header className="pagina-cabecera">
          <div>
            <h1 className="pagina-titulo">Cuenta de caja e inventario</h1>
            <p className="pagina-sub">{fechaLarga()} · Valores en pesos colombianos.</p>
          </div>
        </header>

        {error && <p className="aviso aviso-error" role="alert">{error}</p>}
        {exito && <p className="aviso caja-aviso-exito" role="status">{exito}</p>}
        {cargando && <p className="campo-ayuda">Cargando movimientos del día…</p>}

        {!cargando && resumen && (
          <>
            <section className="cifras caja-cifras" aria-label="Resumen de caja">
              <article className="cifra">
                <span>Ingresos totales de pedidos</span>
                <strong>{pesos(resumen.ingresos)}</strong>
                <small>
                  Incluye todos los medios de pago · En efectivo: {pesos(resumen.ingresos_efectivo)}
                </small>
              </article>
              <article className="cifra">
                <span>Egresos</span>
                <strong>{pesos(resumen.egresos)}</strong>
                <small>Gastos registrados en el turno</small>
              </article>
              <article className="cifra">
                <span>Ganancia del día</span>
                <strong>{pesos(resumen.ganancias)}</strong>
                <small>Ingresos menos egresos</small>
              </article>
              <article className="cifra">
                <span>Efectivo esperado en caja</span>
                <strong>
                  {resumen.efectivo_esperado == null
                    ? "—"
                    : pesos(resumen.efectivo_esperado)}
                </strong>
                <small>Apertura + pagos en efectivo − egresos · sin pagos digitales</small>
              </article>
            </section>

            {!turnoAbierto && (
              <section className="tarjeta caja-panel">
                <div className="caja-panel-titulo">
                  <Banknote aria-hidden="true" />
                  <div>
                    <h2 className="tarjeta-titulo">
                      {resumen.turno ? "Abrir caja nuevamente" : "Abrir caja"}
                    </h2>
                    <p className="campo-ayuda">
                      {resumen.apertura_sugerida == null
                        ? "Registra el dinero con el que comienzas el turno."
                        : `Del cierre anterior se dejaron ${pesos(resumen.apertura_sugerida)} en caja. Ese es el monto sugerido para abrir; puedes ajustarlo y explicar la diferencia.`}
                    </p>
                  </div>
                </div>
                <form className="caja-formulario" onSubmit={abrirCaja}>
                  <div className="campo">
                    <label htmlFor="caja-apertura">Dinero que recibe para abrir caja (COP)</label>
                    <input
                      id="caja-apertura"
                      className="entrada"
                      type="number"
                      min="0"
                      step="1"
                      value={apertura}
                      onChange={(event) => setApertura(event.target.value)}
                      required
                    />
                  </div>
                  {resumen.apertura_sugerida != null &&
                    Math.abs(Number(apertura) - Number(resumen.apertura_sugerida)) > 0.01 && (
                      <div className="campo caja-observacion-apertura">
                        <label htmlFor="caja-observacion-apertura">
                          Motivo de la diferencia con el cierre anterior
                        </label>
                        <textarea
                          id="caja-observacion-apertura"
                          className="area-texto"
                          maxLength="500"
                          value={observacionApertura}
                          onChange={(event) => setObservacionApertura(event.target.value)}
                          required
                        />
                      </div>
                    )}
                  <button className="btn btn-primario" type="submit" disabled={guardando}>
                    Abrir caja
                  </button>
                </form>
              </section>
            )}

            {turnoAbierto && (
              <>
                <section className="caja-dos-columnas">
                  <div className="tarjeta caja-panel">
                    <div className="caja-panel-titulo">
                      <ReceiptText aria-hidden="true" />
                      <div>
                        <h2 className="tarjeta-titulo">Registrar egreso</h2>
                        <p className="campo-ayuda">El gasto se descuenta del efectivo esperado y de la ganancia.</p>
                      </div>
                    </div>
                    <form className="caja-formulario-vertical" onSubmit={registrarEgreso}>
                      <div className="campo">
                        <label htmlFor="egreso-descripcion">¿En qué se gastó?</label>
                        <input
                          id="egreso-descripcion"
                          className="entrada"
                          maxLength="250"
                          value={descripcion}
                          onChange={(event) => setDescripcion(event.target.value)}
                          required
                        />
                      </div>
                      <div className="campo">
                        <label htmlFor="egreso-valor">Valor (COP)</label>
                        <input
                          id="egreso-valor"
                          className="entrada"
                          type="number"
                          min="1"
                          step="1"
                          value={valorEgreso}
                          onChange={(event) => setValorEgreso(event.target.value)}
                          required
                        />
                      </div>
                      <button className="btn btn-secundario" type="submit" disabled={guardando}>
                        Guardar egreso
                      </button>
                    </form>
                  </div>

                  <div className="tarjeta caja-panel">
                    <div className="caja-panel-titulo">
                      <Banknote aria-hidden="true" />
                      <div>
                        <h2 className="tarjeta-titulo">Cerrar y cuadrar caja</h2>
                        <p className="campo-ayuda">
                          {resumen.turno.fecha !== resumen.fecha
                            ? `Esta caja quedó abierta desde el ${fechaCaja(resumen.turno.fecha)}. Ciérrala para poder abrir la caja de hoy.`
                            : "Cuenta todo el efectivo físico para cuadrar. Luego indica cuánto dejas en caja para la próxima apertura; el resto se considera retirado."}{" "}
                          No incluyas pagos digitales.
                        </p>
                      </div>
                    </div>
                    <form className="caja-formulario-vertical" onSubmit={cerrarCaja}>
                      <div className="campo">
                        <label htmlFor="caja-conteo">
                          Dinero en efectivo contado al cierre (COP)
                        </label>
                        <input
                          id="caja-conteo"
                          className="entrada"
                          type="number"
                          min="0"
                          step="1"
                          value={efectivoContado}
                          onChange={(event) => setEfectivoContado(event.target.value)}
                          required
                        />
                      </div>
                      <div className="campo">
                        <label htmlFor="caja-dejado">
                          Dinero en efectivo que deja en caja para la próxima apertura (COP)
                        </label>
                        <input
                          id="caja-dejado"
                          className="entrada"
                          type="number"
                          min="0"
                          max={efectivoContado || "0"}
                          step="1"
                          value={montoDejadoCaja}
                          onChange={(event) => setMontoDejadoCaja(event.target.value)}
                          required
                        />
                        <span className="campo-ayuda">
                          Se dejarán {pesos(Number(montoDejadoCaja) || 0)} y se retirarán{" "}
                          {pesos(Math.max(0, (Number(efectivoContado) || 0) - (Number(montoDejadoCaja) || 0)))}.
                        </span>
                      </div>
                      {Number(efectivoContado) !== Number(resumen.efectivo_esperado) && (
                        <div className="campo">
                          <label htmlFor="caja-observacion">Observación de la diferencia</label>
                          <textarea
                            id="caja-observacion"
                            className="area-texto"
                            maxLength="500"
                            value={observacionCierre}
                            onChange={(event) => setObservacionCierre(event.target.value)}
                            required
                          />
                        </div>
                      )}
                      <button className="btn btn-primario" type="submit" disabled={guardando}>
                        Cerrar caja
                      </button>
                    </form>
                  </div>
                </section>

                <section className="tarjeta caja-panel">
                  <div className="caja-panel-titulo">
                    <PackageCheck aria-hidden="true" />
                    <div>
                      <h2 className="tarjeta-titulo">Conteo físico de inventario</h2>
                      <p className="campo-ayuda">
                        Compara existencias del sistema y unidades contadas. Si falta o sobra algo, deja la observación.
                      </p>
                    </div>
                  </div>
                  {conteoHecho ? (
                    <p className="caja-estado">
                      Conteo guardado. Las diferencias y observaciones quedaron en el historial de inventario.
                    </p>
                  ) : (
                    <form onSubmit={guardarConteo}>
                      <div className="caja-tabla-contenedor">
                        <table className="caja-tabla">
                          <thead>
                            <tr>
                              <th>Producto</th>
                              <th>Vendidos hoy</th>
                              <th>Stock esperado</th>
                              <th>Conteo físico</th>
                              <th>Diferencia / observación</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inventario?.productos.map((producto) => {
                              const diferencia = Number(cantidades[producto.producto_id]) -
                                Number(producto.stock_esperado);
                              return (
                                <tr key={producto.producto_id}>
                                  <td>{producto.nombre}</td>
                                  <td>{Number(producto.vendidas)}</td>
                                  <td>{Number(producto.stock_esperado)}</td>
                                  <td>
                                    <input
                                      className="entrada caja-cantidad"
                                      type="number"
                                      min="0"
                                      step="1"
                                      value={cantidades[producto.producto_id] ?? ""}
                                      onChange={(event) => setCantidades((actual) => ({
                                        ...actual,
                                        [producto.producto_id]: event.target.value
                                      }))}
                                      required
                                      aria-label={`Cantidad contada de ${producto.nombre}`}
                                    />
                                  </td>
                                  <td>
                                    <strong className={diferencia === 0 ? "" : "caja-diferencia"}>
                                      {diferencia > 0 ? "+" : ""}{diferencia}
                                    </strong>
                                    {diferencia !== 0 && (
                                      <input
                                        className="entrada caja-observacion"
                                        maxLength="250"
                                        placeholder="Explica la diferencia"
                                        value={observaciones[producto.producto_id] || ""}
                                        onChange={(event) => setObservaciones((actual) => ({
                                          ...actual,
                                          [producto.producto_id]: event.target.value
                                        }))}
                                        required
                                        aria-label={`Observación para ${producto.nombre}`}
                                      />
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                            {inventario?.productos.length === 0 && (
                              <tr><td colSpan="5">No hay productos con control de inventario.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <button
                        className="btn btn-secundario caja-guardar-conteo"
                        type="submit"
                        disabled={guardando || !inventario?.productos.length}
                      >
                        <ClipboardList size={16} aria-hidden="true" />
                        Guardar conteo
                      </button>
                    </form>
                  )}
                </section>

                <section className="tarjeta caja-panel">
                  <h2 className="tarjeta-titulo">Egresos registrados</h2>
                  {resumen.egresos_detalle.length ? (
                    <ul className="caja-lista-egresos">
                      {resumen.egresos_detalle.map((egreso) => (
                        <li key={egreso.egreso_id}>
                          <span>{egreso.descripcion}</span>
                          <strong>{pesos(egreso.valor)}</strong>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="campo-ayuda">Aún no registras gastos en este turno.</p>}
                </section>
              </>
            )}

            {resumen.turno && !turnoAbierto && !resumen.apertura_sugerida && (
              <section className="tarjeta caja-panel">
                <h2 className="tarjeta-titulo">Caja cerrada</h2>
                <dl className="lista-datos">
                  <div><dt>Efectivo esperado</dt><dd>{pesos(resumen.efectivo_esperado)}</dd></div>
                  <div><dt>Efectivo contado</dt><dd>{pesos(resumen.turno.efectivo_contado)}</dd></div>
                  <div>
                    <dt>Efectivo que deja en caja</dt>
                    <dd>{pesos(resumen.turno.monto_dejado_caja ?? resumen.turno.efectivo_contado)}</dd>
                  </div>
                  <div>
                    <dt>Efectivo retirado</dt>
                    <dd>
                      {pesos(
                        Number(resumen.turno.efectivo_contado) -
                        Number(resumen.turno.monto_dejado_caja ?? resumen.turno.efectivo_contado)
                      )}
                    </dd>
                  </div>
                  <div><dt>Diferencia</dt><dd>{pesos(resumen.turno.diferencia_cierre)}</dd></div>
                  {resumen.turno.observacion_cierre && (
                    <div><dt>Observación</dt><dd>{resumen.turno.observacion_cierre}</dd></div>
                  )}
                </dl>
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
