import { useEffect, useMemo, useState } from "react";
import { ExternalLink, PackagePlus, Save, Search } from "lucide-react";
import { Link } from "react-router-dom";
import AppShell from "../components/AppShell";
import { fechaLocal } from "../lib/formato";
import { apiFetch } from "../services/api";
import "./admin.css";
import "./AdminInventory.css";

function fechaMovimiento(movimiento) {
  const fecha = movimiento.creado_en || movimiento.fecha_movimiento || movimiento.fecha;
  return fecha
    ? new Date(fecha).toLocaleString("es-CO", {
        dateStyle: "short",
        timeStyle: "short"
      })
    : "—";
}

export default function AdminInventory() {
  const [productos, setProductos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [seleccionado, setSeleccionado] = useState(null);
  const [stockNuevo, setStockNuevo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [exito, setExito] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [recargar, setRecargar] = useState(0);

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      try {
        const datos = await apiFetch("/inventory/admin");
        if (cancelado) return;
        setProductos(datos.productos || []);
        setMovimientos(datos.movimientos || []);
      } catch (err) {
        if (!cancelado) setError(err.message);
      }
    }
    cargar();
    return () => {
      cancelado = true;
    };
  }, [recargar]);

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return productos.filter((producto) =>
      `${producto.nombre} ${producto.codigo || ""} ${producto.categoria || ""}`
        .toLowerCase()
        .includes(texto)
    );
  }, [productos, busqueda]);

  const totalUnidades = productos.reduce(
    (total, producto) => total + (producto.controla_inventario ? Number(producto.stock_actual) : 0),
    0
  );
  const bajoMinimo = productos.filter(
    (producto) => producto.controla_inventario &&
      Number(producto.stock_actual) <= Number(producto.stock_minimo)
  ).length;

  function iniciarAjuste(producto) {
    setSeleccionado(producto);
    setStockNuevo(String(Number(producto.stock_actual)));
    setMotivo("");
    setError("");
    setExito("");
  }

  async function guardarAjuste(event) {
    event.preventDefault();
    if (!seleccionado) return;
    setGuardando(true);
    setError("");
    setExito("");
    try {
      const resultado = await apiFetch(`/inventory/${seleccionado.producto_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          stock_actual: Number(stockNuevo),
          motivo
        })
      });
      setExito(resultado.mensaje || "Inventario actualizado.");
      setSeleccionado(null);
      setRecargar((actual) => actual + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <AppShell area="admin" seccion="Inventario">
      <div className="pagina">
        <header className="pagina-cabecera">
          <div>
            <h1 className="pagina-titulo">Inventario</h1>
            <p className="pagina-sub">Existencias actuales y movimientos auditados.</p>
          </div>
          <Link className="btn btn-primario" to="/admin/productos">
            <PackagePlus size={16} aria-hidden="true" />
            Crear o administrar productos
          </Link>
        </header>

        {error && <p className="aviso aviso-error" role="alert">{error}</p>}
        {exito && <p className="aviso admin-inventario-exito" role="status">{exito}</p>}

        <section className="cifras admin-inventario-resumen">
          <article className="cifra">
            <span>Productos inventariados</span>
            <strong>{productos.filter((producto) => producto.controla_inventario).length}</strong>
            <small>{totalUnidades} unidades registradas</small>
          </article>
          <article className="cifra">
            <span>En mínimo o agotados</span>
            <strong>{bajoMinimo}</strong>
            <small>Revisar reposición</small>
          </article>
        </section>

        {seleccionado && (
          <section className="tarjeta admin-inventario-ajuste">
            <div>
              <h2 className="tarjeta-titulo">Ajustar {seleccionado.nombre}</h2>
              <p className="campo-ayuda">
                El sistema registrará el stock anterior, nuevo y el motivo en el historial.
              </p>
            </div>
            <form className="admin-inventario-form" onSubmit={guardarAjuste}>
              <div className="campo">
                <label htmlFor="inventario-stock">Nueva cantidad en stock</label>
                <input
                  id="inventario-stock"
                  className="entrada"
                  type="number"
                  min="0"
                  step="1"
                  value={stockNuevo}
                  onChange={(event) => setStockNuevo(event.target.value)}
                  required
                />
              </div>
              <div className="campo">
                <label htmlFor="inventario-motivo">Motivo del ajuste</label>
                <input
                  id="inventario-motivo"
                  className="entrada"
                  maxLength="250"
                  value={motivo}
                  onChange={(event) => setMotivo(event.target.value)}
                  placeholder="Ej. compra, corrección de conteo"
                  required
                />
              </div>
              <div className="admin-inventario-acciones">
                <button className="btn btn-secundario" type="button" onClick={() => setSeleccionado(null)}>
                  Cancelar
                </button>
                <button className="btn btn-primario" type="submit" disabled={guardando}>
                  <Save size={16} aria-hidden="true" />
                  {guardando ? "Guardando…" : "Guardar ajuste"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="tarjeta">
          <div className="admin-inventario-lista-cabecera">
            <h2 className="tarjeta-titulo">Existencias</h2>
            <label className="admin-inventario-busqueda">
              <Search size={16} aria-hidden="true" />
              <input
                className="entrada"
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
                placeholder="Buscar producto"
                aria-label="Buscar producto"
              />
            </label>
          </div>
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Stock actual</th>
                  <th>Stock mínimo</th>
                  <th>Estado</th>
                  <th>Gestión</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((producto) => {
                  const controla = producto.controla_inventario;
                  const bajo = controla && Number(producto.stock_actual) <= Number(producto.stock_minimo);
                  return (
                    <tr key={producto.producto_id}>
                      <td>
                        <strong>{producto.nombre}</strong>
                        <small className="admin-inventario-codigo">{producto.codigo || "Sin código"}</small>
                      </td>
                      <td>{producto.categoria || "Sin categoría"}</td>
                      <td>{controla ? `${Number(producto.stock_actual)} unidades` : "Sin control"}</td>
                      <td>{controla ? Number(producto.stock_minimo) : "—"}</td>
                      <td>
                        <span className={`chip ${bajo ? "chip-ambar" : "chip-verde"}`}>
                          {!controla ? "No inventariable" : bajo ? "Reponer" : "Disponible"}
                        </span>
                      </td>
                      <td>
                        {controla && (
                          <button
                            className="btn btn-secundario btn-sm"
                            type="button"
                            onClick={() => iniciarAjuste(producto)}
                          >
                            Ajustar stock
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!filtrados.length && <tr><td colSpan="6" className="vacio">No hay productos para mostrar.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="campo-ayuda admin-inventario-ayuda">
            Para crear, editar o desactivar artículos, usa la administración de productos.
            <Link to="/admin/productos"> Ir a productos <ExternalLink size={13} aria-hidden="true" /></Link>
          </p>
        </section>

        <section className="tarjeta">
          <h2 className="tarjeta-titulo">Historial de movimientos</h2>
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Producto</th>
                  <th>Movimiento</th>
                  <th>Anterior</th>
                  <th>Nuevo</th>
                  <th>Motivo</th>
                  <th>Registró</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((movimiento, indice) => (
                  <tr key={movimiento.movimiento_id || `${movimiento.producto_id}-${movimiento.stock_nuevo}-${indice}`}>
                    <td>{fechaMovimiento(movimiento)}</td>
                    <td>{movimiento.producto}</td>
                    <td>{movimiento.tipo} · {movimiento.cantidad}</td>
                    <td>{movimiento.stock_anterior}</td>
                    <td>{movimiento.stock_nuevo}</td>
                    <td>{movimiento.motivo || "—"}</td>
                    <td>{movimiento.usuario}</td>
                  </tr>
                ))}
                {!movimientos.length && (
                  <tr><td colSpan="7" className="vacio">No hay movimientos registrados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <small className="campo-ayuda">Últimos movimientos · actualizado {fechaLocal()}</small>
        </section>
      </div>
    </AppShell>
  );
}
