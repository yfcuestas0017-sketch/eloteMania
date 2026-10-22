import { Printer, X } from "lucide-react";
import { etiquetaPedido, pesos } from "../lib/formato";
import "./HistorialDia.css";

function horaPedido(fecha) {
  return new Date(fecha).toLocaleTimeString("es-CO", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

/**
 * Historial de pedidos del punto elegido en la gráfica.
 * Ocupa el lugar de la sección "Historial de todos los pedidos".
 */
export default function HistorialDia({ seleccion, nombreCajero, onCerrar, onVerComprobante }) {
  const pedidos = [...seleccion.pedidos].sort(
    (a, b) => new Date(b.fecha_venta) - new Date(a.fecha_venta)
  );

  return (
    <section id="seccion-pedidos" className="tarjeta no-imprimir gv-historial">
      <div className="tarjeta-cabecera-accion">
        <div>
          <h2 className="tarjeta-titulo gv-historial-titulo">{seleccion.encabezado}</h2>
          <p className="campo-ayuda">
            {nombreCajero
              ? `Pedidos cobrados por ${nombreCajero}.`
              : "Pedidos de todos los cajeros."}{" "}
            Toca “Imprimir” para ver el voucher.
          </p>
        </div>

        <div className="cabecera-acciones-lado">
          <span className="chip chip-verde">
            {pedidos.length} {pedidos.length === 1 ? "pedido" : "pedidos"} · {pesos(seleccion.total)}
          </span>
          <button type="button" className="btn btn-secundario btn-sm" onClick={onCerrar}>
            <X size={14} aria-hidden="true" />
            Ver todos los pedidos
          </button>
        </div>
      </div>

      {pedidos.length === 0 ? (
        <p className="vacio">No hubo pedidos cobrados en este {seleccion.porHora ? "horario" : "día"}.</p>
      ) : (
        <ul className="gv-lista">
          {pedidos.map((pedido) => (
            <li key={pedido.venta_id} className="gv-pedido">
              <div className="gv-pedido-cab">
                <div>
                  <strong>{etiquetaPedido(pedido)}</strong>
                  <small>{pedido.numero_comprobante}</small>
                </div>
                <span className="gv-hora">{horaPedido(pedido.fecha_venta)}</span>
              </div>

              <ul className="gv-productos">
                {(pedido.productos || []).map((prod, idx) => (
                  <li key={idx}>
                    <span>
                      <b>{prod.cantidad}×</b> {prod.nombre}
                    </span>
                    {prod.observaciones && <small>({prod.observaciones})</small>}
                  </li>
                ))}
              </ul>

              <div className="gv-pedido-pie">
                <div className="gv-etiquetas">
                  <span className="chip chip-pago">{pedido.metodo_pago}</span>
                  {pedido.cajero && <span className="chip">{pedido.cajero}</span>}
                </div>
                <strong className="gv-monto">{pesos(pedido.total)}</strong>
                <button
                  type="button"
                  className="btn btn-secundario btn-sm gv-imprimir"
                  onClick={() => onVerComprobante(pedido)}
                >
                  <Printer size={15} aria-hidden="true" />
                  Imprimir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
