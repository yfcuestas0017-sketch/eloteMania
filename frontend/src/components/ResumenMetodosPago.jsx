import { Banknote, Smartphone } from "lucide-react";
import { pesos } from "../lib/formato";
import "./ResumenMetodosPago.css";

// Quita tildes y pasa a minúsculas para comparar nombres sin importar cómo
// estén escritos en la base de datos ("Efectivo", "EFECTIVO", "Tarjeta débito"...).
function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Muestra dos tarjetas:
 *  - Total recaudado en efectivo.
 *  - Total recaudado por medios digitales (Nequi, transferencia, tarjeta
 *    débito y crédito), con el detalle de cada uno.
 *
 * `metodos` es la respuesta de GET /reports/metodos-pago:
 *   [{ metodo_pago_id, nombre, cantidad_ventas, total }]
 */
export default function ResumenMetodosPago({ metodos = [] }) {
  const efectivo = metodos.filter((m) => normalizar(m.nombre).includes("efectivo"));
  const digitales = metodos.filter((m) => !normalizar(m.nombre).includes("efectivo"));

  const suma = (lista, campo) =>
    lista.reduce((acc, m) => acc + Number(m[campo] || 0), 0);

  const totalEfectivo = suma(efectivo, "total");
  const ventasEfectivo = suma(efectivo, "cantidad_ventas");
  const totalDigital = suma(digitales, "total");
  const ventasDigital = suma(digitales, "cantidad_ventas");

  return (
    <section
      className="pagos-resumen no-imprimir"
      aria-label="Total recaudado por método de pago"
    >
      <article className="pagos-tarjeta pagos-efectivo">
        <header className="pagos-cabecera">
          <span className="pagos-icono" aria-hidden="true">
            <Banknote size={20} />
          </span>
          <div>
            <h2 className="pagos-titulo">Recaudado en efectivo</h2>
            <small>
              {ventasEfectivo} {ventasEfectivo === 1 ? "venta" : "ventas"}
            </small>
          </div>
        </header>
        <strong className="pagos-total">{pesos(totalEfectivo)}</strong>
      </article>

      <article className="pagos-tarjeta pagos-digital">
        <header className="pagos-cabecera">
          <span className="pagos-icono" aria-hidden="true">
            <Smartphone size={20} />
          </span>
          <div>
            <h2 className="pagos-titulo">Recaudado por medios digitales</h2>
            <small>
              Nequi, transferencia, tarjeta débito y crédito · {ventasDigital}{" "}
              {ventasDigital === 1 ? "venta" : "ventas"}
            </small>
          </div>
        </header>
        <strong className="pagos-total">{pesos(totalDigital)}</strong>

        {digitales.length > 0 && (
          <ul className="pagos-detalle">
            {digitales.map((m) => (
              <li key={m.metodo_pago_id}>
                <span>
                  {m.nombre}
                  <small> · {m.cantidad_ventas}</small>
                </span>
                <strong>{pesos(m.total)}</strong>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
