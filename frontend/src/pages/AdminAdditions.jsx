import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Power } from "lucide-react";
import AppShell from "../components/AppShell";
import { apiFetch } from "../services/api";
import { pesos } from "../lib/formato";
import "./admin.css";
import "./AdminAdditions.css";

const formularioInicial = {
  nombre: "",
  precio: "",
  producto_ids: []
};

export default function AdminAdditions() {
  const [adicionales, setAdicionales] = useState([]);
  const [productos, setProductos] = useState([]);
  const [formulario, setFormulario] = useState(formularioInicial);
  const [editando, setEditando] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function cargarDatos() {
    try {
      const [respuestaAdicionales, respuestaProductos] = await Promise.all([
        apiFetch("/additions"),
        apiFetch("/products/admin")
      ]);
      setAdicionales(respuestaAdicionales.adicionales || []);
      setProductos(
        (respuestaProductos.productos || []).filter(
          (producto) => !producto.eliminado_en
        )
      );
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    async function cargarInicial() {
      try {
        const [respuestaAdicionales, respuestaProductos] = await Promise.all([
          apiFetch("/additions"),
          apiFetch("/products/admin")
        ]);
        setAdicionales(respuestaAdicionales.adicionales || []);
        setProductos(
          (respuestaProductos.productos || []).filter(
            (producto) => !producto.eliminado_en
          )
        );
      } catch (err) {
        setError(err.message);
      }
    }

    cargarInicial();
  }, []);

  function limpiarFormulario() {
    setFormulario(formularioInicial);
    setEditando(null);
    setError("");
  }

  function editar(adicional) {
    setEditando(adicional);
    setFormulario({
      nombre: adicional.nombre,
      precio: String(adicional.precio),
      producto_ids: adicional.productos.map((producto) =>
        String(producto.producto_id)
      )
    });
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function alternarProducto(productoId) {
    setFormulario((actual) => ({
      ...actual,
      producto_ids: actual.producto_ids.includes(String(productoId))
        ? actual.producto_ids.filter((id) => id !== String(productoId))
        : [...actual.producto_ids, String(productoId)]
    }));
  }

  async function guardar(event) {
    event.preventDefault();
    setError("");
    setCargando(true);
    try {
      await apiFetch(
        editando ? `/additions/${editando.adicional_id}` : "/additions",
        {
          method: editando ? "PUT" : "POST",
          body: JSON.stringify({
            nombre: formulario.nombre.trim(),
            precio: Number(formulario.precio),
            producto_ids: formulario.producto_ids.map(Number),
            ...(editando ? { activo: editando.activo } : {})
          })
        }
      );
      limpiarFormulario();
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  async function cambiarEstado(adicional) {
    setError("");
    try {
      await apiFetch(`/additions/${adicional.adicional_id}`, {
        method: "PUT",
        body: JSON.stringify({
          nombre: adicional.nombre,
          precio: Number(adicional.precio),
          producto_ids: adicional.productos.map((producto) =>
            Number(producto.producto_id)
          ),
          activo: !adicional.activo
        })
      });
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AppShell area="admin" seccion="Adicionales">
      <div className="pagina">
        <header className="pagina-cabecera">
          <div>
            <h1 className="pagina-titulo">Adicionales</h1>
            <p className="pagina-sub">
              Configura extras y asígnalos a uno o varios productos.
            </p>
          </div>
        </header>

        {error && <p className="aviso aviso-error" role="alert">{error}</p>}

        <form className="tarjeta formulario-principal" onSubmit={guardar}>
          <h2 className="tarjeta-titulo">
            {editando ? "Editar adicional" : "Nuevo adicional"}
          </h2>
          <div className="rejilla-2">
            <div className="campo">
              <label htmlFor="adicional-nombre">Nombre del adicional *</label>
              <input
                id="adicional-nombre"
                className="entrada"
                value={formulario.nombre}
                onChange={(event) =>
                  setFormulario({
                    ...formulario,
                    nombre: event.target.value
                  })
                }
                maxLength={100}
                placeholder="Ej. Queso"
                required
              />
            </div>
            <div className="campo">
              <label htmlFor="adicional-precio">Precio por unidad (COP) *</label>
              <input
                id="adicional-precio"
                className="entrada"
                type="number"
                min="0"
                step="50"
                value={formulario.precio}
                onChange={(event) =>
                  setFormulario({
                    ...formulario,
                    precio: event.target.value
                  })
                }
                required
              />
            </div>
          </div>

          <fieldset className="adicional-productos">
            <legend>Productos que pueden llevar este adicional *</legend>
            <div className="adicional-productos-lista">
              {productos.map((producto) => (
                <label key={producto.producto_id}>
                  <input
                    type="checkbox"
                    checked={formulario.producto_ids.includes(
                      String(producto.producto_id)
                    )}
                    onChange={() => alternarProducto(producto.producto_id)}
                  />
                  <span>{producto.nombre}</span>
                  <small>{pesos(producto.precio)}</small>
                </label>
              ))}
              {productos.length === 0 && (
                <p className="campo-ayuda">
                  No hay productos activos disponibles para asignar.
                </p>
              )}
            </div>
          </fieldset>

          <div className="formulario-pie">
            <span className="campo-ayuda">
              Selecciona uno o varios productos.
            </span>
            <div className="acciones">
              {editando && (
                <button
                  type="button"
                  className="btn btn-secundario"
                  onClick={limpiarFormulario}
                >
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                className="btn btn-primario"
                disabled={cargando || productos.length === 0}
              >
                {editando ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <Plus size={16} aria-hidden="true" />
                )}
                {cargando
                  ? "Guardando..."
                  : editando
                    ? "Guardar cambios"
                    : "Crear adicional"}
              </button>
            </div>
          </div>
        </form>

        <section className="tarjeta">
          <div className="tabla-contenedor tabla-tarjetas-contenedor">
            <table className="tabla tabla-tarjetas">
              <thead>
                <tr>
                  <th>Adicional</th>
                  <th>Precio</th>
                  <th>Productos asociados</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {adicionales.map((adicional) => (
                  <tr key={adicional.adicional_id}>
                    <td className="celda-titulo"><strong>{adicional.nombre}</strong></td>
                    <td data-label="Precio">{pesos(adicional.precio)}</td>
                    <td data-label="Productos asociados" className="celda-bloque">
                      {adicional.productos
                        .map((producto) => producto.nombre)
                        .join(", ") || "Sin productos"}
                    </td>
                    <td data-label="Estado">
                      <span
                        className={`chip ${adicional.activo ? "chip-verde" : "chip-ambar"}`}
                      >
                        {adicional.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="celda-acciones">
                      <div className="acciones">
                        <button
                          type="button"
                          className="btn-icono es-rojo"
                          onClick={() => editar(adicional)}
                          aria-label={`Editar ${adicional.nombre}`}
                          title="Editar"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn-icono"
                          onClick={() => cambiarEstado(adicional)}
                          aria-label={`${adicional.activo ? "Desactivar" : "Activar"} ${adicional.nombre}`}
                          title={adicional.activo ? "Desactivar" : "Activar"}
                        >
                          <Power size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {adicionales.length === 0 && (
                  <tr>
                    <td colSpan="5" className="vacio">
                      Aún no hay adicionales configurados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="tabla-pie">{adicionales.length} adicionales</div>
        </section>
      </div>
    </AppShell>
  );
}
