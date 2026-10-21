import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileText, ShoppingBasket } from "lucide-react";
import AppShell from "../components/AppShell";
import { apiFetch } from "../services/api";
import { fechaLarga, fechaLocal, leerUsuario, pesos } from "../lib/formato";
import "./admin.css";
import "./CashierDashboard.css";

export default function CashierDashboard() {
  const usuario = leerUsuario();
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function cargar() {
      const hoy = fechaLocal();

      try {
        const datosResumen = await apiFetch(
          `/reports/resumen?desde=${hoy}&hasta=${hoy}`
        );

        setResumen(datosResumen);
      } catch (err) {
        setError(err.message);
      }
    }

    cargar();
  }, []);

  const nombre = usuario.nombres || usuario.nombre_usuario || "equipo";

  return (
    <AppShell area="caja" seccion="Inicio">
      <div className="pagina">
        <header className="pagina-cabecera">
          <div>
            <h1 className="pagina-titulo">¡Hola, {nombre}!</h1>
            <p className="pagina-sub">{fechaLarga()} · Esto es lo que va del día.</p>
          </div>
        </header>

        {error && <p className="aviso aviso-error">{error}</p>}

        <section className="cifras" aria-label="Tu día">
          <article className="cifra">
            <span>Tus ventas de hoy</span>
            <strong>{pesos(resumen?.total_recaudado)}</strong>
            <small>COP</small>
          </article>

          <article className="cifra">
            <span>Pedidos cobrados</span>
            <strong>{resumen?.cantidad_ventas ?? 0}</strong>
            <small>Ticket promedio {pesos(resumen?.promedio_venta)}</small>
          </article>

        </section>

        <div className="caja-accesos">
          <Link to="/caja/ventas" className="caja-acceso principal">
            <ShoppingBasket size={28} aria-hidden="true" />
            <div>
              <h2>Punto de venta</h2>
              <p>Registra un pedido y genera el comprobante al instante.</p>
            </div>
            <ArrowRight size={20} aria-hidden="true" />
          </Link>

          <Link to="/caja/reportes" className="caja-acceso">
            <FileText size={28} aria-hidden="true" />
            <div>
              <h2>Mis pedidos y reportes</h2>
              <p>Historial de cobros realizados y reimpresión de vouchers.</p>
            </div>
            <ArrowRight size={20} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
