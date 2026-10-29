import { useEffect } from "react";
import { Check, Printer, X } from "lucide-react";
import logo from "../assets/logo-elote-mania.png";
import { NEGOCIO } from "../config/negocio";
import { etiquetaPedido, pesos } from "../lib/formato";
import { apiFetch } from "../services/api";
import "./ComprobanteModal.css";

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

export default function ComprobanteModal({ comprobante, onCerrar, onImpresionRegistrada }) {
  useEffect(() => {
    function manejarTecla(e) {
      if (e.key === "Escape") onCerrar();
    }
    window.addEventListener("keydown", manejarTecla);
    return () => window.removeEventListener("keydown", manejarTecla);
  }, [onCerrar]);

  if (!comprobante) return null;

  async function imprimir() {
    window.print();

    if (comprobante.comprobante_id) {
      try {
        const respuesta = await apiFetch(
          `/receipts/${comprobante.comprobante_id}/impresiones`,
          { method: "POST" }
        );
        if (onImpresionRegistrada) {
          onImpresionRegistrada(comprobante.comprobante_id, respuesta.cantidad_impresiones);
        }
      } catch (err) {
        console.warn("No se pudo auditar la reimpresión:", err.message);
      }
    }
  }

  const productos = comprobante.productos || [];

  return (
    <div className="modal-fondo">
      <div className="modal-dialogo" role="dialog" aria-modal="true">
        <header className="modal-cabecera no-imprimir">
          <div>
            <h3 className="modal-titulo">Comprobante de pedido</h3>
            <p className="modal-sub">
              {comprobante.numero_comprobante} · Pedido {etiquetaPedido(comprobante)}
            </p>
          </div>
          <button
            type="button"
            className="btn-icono"
            onClick={onCerrar}
            aria-label="Cerrar vista previa"
          >
            <X size={20} />
          </button>
        </header>

        <div className="modal-cuerpo">
          <section className="caja-comprobante">
            <div className="comprobante-contenido">
              <header className="comprobante-encabezado">
                <img
                  className="comprobante-logo"
                  src={logo}
                  alt=""
                  width="72"
                  height="72"
                />
                <h2>ELOTE MANÍA</h2>
                <p>WhatsApp {NEGOCIO.whatsapp}</p>
                <small>Comprobante de pedido · COP</small>
                {comprobante.cantidad_ediciones > 0 && (
                  <span className="comprobante-reimpresion-tag">
                    ** PEDIDO MODIFICADO (versión #{Number(comprobante.cantidad_ediciones) + 1}) **
                  </span>
                )}
                {comprobante.cantidad_impresiones > 0 && (
                  <span className="comprobante-reimpresion-tag">
                    ** REIMPRESIÓN (Copia #{comprobante.cantidad_impresiones}) **
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
                  <strong>{formatoFecha(comprobante.fecha_emision || comprobante.fecha_venta)}</strong>
                </div>
                {comprobante.cantidad_ediciones > 0 && comprobante.ultima_edicion && (
                  <div className="comprobante-fila">
                    <span>Modificado</span>
                    <strong>{formatoFecha(comprobante.ultima_edicion)}</strong>
                  </div>
                )}
                <div className="comprobante-fila">
                  <span>Cajero</span>
                  <strong>{comprobante.cajero || "Caja principal"}</strong>
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
                {productos.map((producto, indice) => (
                  <div
                    className="comprobante-producto"
                    key={`${producto.producto_id || indice}-${indice}`}
                  >
                    <div className="comprobante-producto-info">
                      <span className="comprobante-producto-nombre">
                        {producto.tipo_item === "adicional" && "Adicional · "}
                        {producto.cantidad} × {producto.nombre || producto.nombre_producto}
                      </span>
                      {producto.precio_unitario && (
                        <small>Precio unitario: {pesos(producto.precio_unitario)}</small>
                      )}
                      {producto.observaciones && (
                        <span className="comprobante-observacion">
                          Obs: {producto.observaciones}
                        </span>
                      )}
                    </div>
                    <span className="comprobante-producto-total">
                      {pesos(producto.subtotal || producto.total_linea)}
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
                  <strong>{comprobante.metodo_pago || "Confirmado"}</strong>
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

        <footer className="modal-pie no-imprimir">
          <button type="button" className="btn btn-secundario" onClick={onCerrar}>
            Cerrar
          </button>
          <button type="button" className="btn btn-primario" onClick={imprimir}>
            <Printer size={16} aria-hidden="true" />
            Imprimir voucher (80 mm)
          </button>
        </footer>
      </div>
    </div>
  );
}
