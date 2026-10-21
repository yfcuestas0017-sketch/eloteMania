import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  FileText,
  Plus,
  UserPlus
} from "lucide-react";
import AppShell from "../components/AppShell";
import { apiFetch } from "../services/api";
import { fechaLarga, fechaLocal, horaCorta, leerUsuario, pesos } from "../lib/formato";
import "./admin.css";
import "./AdminDashboard.css";

export default function AdminDashboard() {
  const usuario = leerUsuario();
  const [resumen, setResumen] = useState(null);
  const [cajeros, setCajeros] = useState([]);
  const [actualizado, setActualizado] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function cargar() {
      const hoy = fechaLocal();
      const rango = `desde=${hoy}&hasta=${hoy}`;

      try {
        const [datosResumen, datosCajeros] = await Promise.all([
          apiFetch(`/reports/resumen?${rango}`),
          apiFetch(`/reports/ventas-por-cajero?${rango}`)
        ]);

        setResumen(datosResumen);
        setCajeros(datosCajeros);
        setActualizado(new Date());
      } catch (err) {
        setError(err.message);
      } finally {
        setCargando(false);
      }
    }

    cargar();
  }, []);

  const maximo = Math.max(1, ...cajeros.map((c) => Number(c.total_recaudado)));

  return (
    <AppShell area="admin" seccion="Resumen">
      <div className="pagina">
        <header className="pagina-cabecera">
          <div>
            <h1 className="pagina-titulo">El negocio, al día.</h1>
            <p className="pagina-sub">
              {fechaLarga()}
              {actualizado && ` · Resumen actualizado a las ${horaCorta(actualizado)}`}
            </p>
          </div>

          <span className="resumen-fecha">
            <CalendarDays size={16} aria-hidden="true" />
            Hoy ·{" "}
            {new Date().toLocaleDateString("es-CO", {
              day: "numeric",
              month: "short"
            })}
          </span>
        </header>

        {error && <p className="aviso aviso-error">{error}</p>}

        <section className="cifras" aria-label="Cifras del día" aria-busy={cargando}>
          <article className="cifra">
            <span>Ventas de hoy</span>
            <strong>{pesos(resumen?.total_recaudado)}</strong>
            <small>{resumen?.cantidad_ventas ?? 0} ventas registradas</small>
          </article>

          <article className="cifra">
            <span>Pedidos cobrados</span>
            <strong>{resumen?.cantidad_ventas ?? 0}</strong>
            <small>Completados al cobrar</small>
          </article>

          <article className="cifra">
            <span>Ticket promedio</span>
            <strong>{pesos(resumen?.promedio_venta)}</strong>
            <small>COP por pedido</small>
          </article>

          <article className="cifra">
            <span>Cajeros con ventas</span>
            <strong>{cajeros.length}</strong>
            <small>Activos hoy</small>
          </article>
        </section>

        <div className="resumen-fila">
          <section className="tarjeta" aria-labelledby="t-cajeros">
            <div className="resumen-titulo">
              <h2 id="t-cajeros" className="tarjeta-titulo">
                Ventas por cajero
              </h2>
              <span className="chip chip-rojo">Hoy</span>
            </div>

            {cajeros.length === 0 ? (
              <p className="vacio">Aún no hay ventas registradas hoy.</p>
            ) : (
              <ol className="barras">
                {cajeros.slice(0, 6).map((cajero, indice) => {
                  const total = Number(cajero.total_recaudado);

                  return (
                    <li key={cajero.usuario_id}>
                      <span className="barras-valor">{pesos(total)}</span>
                      <span
                        className={`barras-barra${indice === 0 ? " lider" : ""}`}
                        style={{ height: `${Math.max(8, (total / maximo) * 100)}%` }}
                      />
                      <span className="barras-nombre">
                        {cajero.nombres} · {cajero.cantidad_ventas}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="tarjeta tarjeta-pila" aria-labelledby="t-atajos">
            <h2 id="t-atajos" className="tarjeta-titulo">
              Atajos
            </h2>

            <Link to="/admin/productos" className="atajo">
              <Plus size={18} aria-hidden="true" />
              Crear producto
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link to="/admin/usuarios" className="atajo">
              <UserPlus size={18} aria-hidden="true" />
              Crear usuario
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link to="/admin/reportes" className="atajo">
              <FileText size={18} aria-hidden="true" />
              Ver reportes de ventas
              <ArrowRight size={16} aria-hidden="true" />
            </Link>

            <p className="campo-ayuda">
              Sesión de {usuario.nombres || usuario.nombre_usuario || "administrador"}.
            </p>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
