import { useEffect, useState } from "react";
import { Check, Pencil, Plus, Power } from "lucide-react";
import AppShell from "../components/AppShell";
import ConfirmDialog from "../components/ConfirmDialog";
import { apiFetch } from "../services/api";
import "./admin.css";

const inicial = {
  nombre: "",
  descripcion: "",
  orden_visualizacion: 0
};

export default function AdminCategories() {
  const [categorias, setCategorias] = useState([]);
  const [formulario, setFormulario] = useState(inicial);
  const [vista, setVista] = useState("lista");
  const [editando, setEditando] = useState(null);
  const [aCambiar, setACambiar] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function cargarCategorias() {
    try {
      const datos = await apiFetch("/categories/admin");
      setCategorias(datos.categorias);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    cargarCategorias();
  }, []);

  function cambiarCampo(event) {
    setFormulario({
      ...formulario,
      [event.target.name]: event.target.value
    });
  }

  function nueva() {
    setEditando(null);
    setFormulario(inicial);
    setError("");
    setVista("formulario");
  }

  function editar(categoria) {
    setEditando(categoria);
    setFormulario({
      nombre: categoria.nombre || "",
      descripcion: categoria.descripcion || "",
      orden_visualizacion: categoria.orden_visualizacion || 0
    });
    setError("");
    setVista("formulario");
  }

  function volver() {
    setVista("lista");
    setEditando(null);
    setFormulario(inicial);
    setError("");
  }

  async function guardar(event) {
    event.preventDefault();
    setError("");
    setCargando(true);

    try {
      const ruta = editando
        ? `/categories/${editando.categoria_id}`
        : "/categories";

      await apiFetch(ruta, {
        method: editando ? "PUT" : "POST",
        body: JSON.stringify({
          ...formulario,
          orden_visualizacion: Number(formulario.orden_visualizacion)
        })
      });

      volver();
      await cargarCategorias();
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  async function confirmarCambioEstado() {
    if (!aCambiar) return;
    setCargando(true);

    try {
      await apiFetch(`/categories/${aCambiar.categoria_id}`, {
        method: "PUT",
        body: JSON.stringify({
          nombre: aCambiar.nombre,
          descripcion: aCambiar.descripcion,
          orden_visualizacion: aCambiar.orden_visualizacion,
          activa: !aCambiar.activa
        })
      });

      setACambiar(null);
      await cargarCategorias();
    } catch (err) {
      setACambiar(null);
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  const dialogo = (
    <ConfirmDialog
      abierto={Boolean(aCambiar)}
      titulo={
        aCambiar?.activa
          ? `¿Desactivar ${aCambiar?.nombre}?`
          : `¿Activar ${aCambiar?.nombre}?`
      }
      texto={
        aCambiar?.activa
          ? "Dejará de mostrarse en el catálogo público junto con sus productos."
          : "Volverá a mostrarse en el catálogo público."
      }
      confirmar={aCambiar?.activa ? "Sí, desactivar" : "Sí, activar"}
      peligro={Boolean(aCambiar?.activa)}
      cargando={cargando}
      onConfirmar={confirmarCambioEstado}
      onCancelar={() => setACambiar(null)}
    />
  );

  if (vista === "formulario") {
    return (
      <AppShell area="admin" seccion="Categorías">
        <div className="pagina">
          <header className="pagina-cabecera">
            <div>
              <h1 className="pagina-titulo">
                {editando ? "Editar categoría" : "Nueva categoría"}
              </h1>
              <p className="pagina-sub">
                Categorías{editando && ` / ${editando.nombre}`}
              </p>
            </div>
          </header>

          {error && <p className="aviso aviso-error" role="alert">{error}</p>}

          <form className="tarjeta formulario-principal" style={{ maxWidth: 640 }} onSubmit={guardar}>
            <h2 className="tarjeta-titulo">Información de la categoría</h2>

            <div className="campo">
              <label htmlFor="c-nombre">Nombre *</label>
              <input
                id="c-nombre"
                className="entrada"
                name="nombre"
                value={formulario.nombre}
                onChange={cambiarCampo}
                required
              />
            </div>

            <div className="campo">
              <label htmlFor="c-descripcion">Descripción</label>
              <textarea
                id="c-descripcion"
                className="area-texto"
                name="descripcion"
                value={formulario.descripcion}
                onChange={cambiarCampo}
              />
            </div>

            <div className="rejilla-2">
              <div className="campo">
                <label htmlFor="c-orden">Orden de visualización</label>
                <input
                  id="c-orden"
                  className="entrada"
                  name="orden_visualizacion"
                  type="number"
                  value={formulario.orden_visualizacion}
                  onChange={cambiarCampo}
                />
                <span className="campo-ayuda">Los números menores aparecen primero.</span>
              </div>
            </div>

            <div className="formulario-pie">
              <span className="campo-ayuda">* Campos obligatorios</span>
              <div className="acciones">
                <button type="button" className="btn btn-secundario" onClick={volver}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primario" disabled={cargando}>
                  <Check size={16} aria-hidden="true" />
                  {cargando ? "Guardando..." : editando ? "Guardar cambios" : "Crear categoría"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell area="admin" seccion="Categorías">
      <div className="pagina">
        <header className="pagina-cabecera">
          <div>
            <h1 className="pagina-titulo">Categorías</h1>
            <p className="pagina-sub">
              Organiza tu menú. Las categorías activas aparecen como filtros en el catálogo.
            </p>
          </div>

          <button type="button" className="btn btn-primario" onClick={nueva}>
            <Plus size={16} aria-hidden="true" />
            Nueva categoría
          </button>
        </header>

        {error && <p className="aviso aviso-error" role="alert">{error}</p>}

        <section className="tarjeta">
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Productos</th>
                  <th>Orden</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {categorias.map((categoria) => (
                  <tr key={categoria.categoria_id}>
                    <td>
                      <div className="celda-doble">
                        <strong>{categoria.nombre}</strong>
                        {categoria.descripcion && <small>{categoria.descripcion}</small>}
                      </div>
                    </td>
                    <td>{categoria.cantidad_productos ?? 0}</td>
                    <td>{categoria.orden_visualizacion}</td>
                    <td>
                      <span className={`chip ${categoria.activa ? "chip-verde" : ""}`}>
                        {categoria.activa ? "Activa" : "Inactiva"}
                      </span>
                    </td>
                    <td>
                      <div className="acciones">
                        <button
                          type="button"
                          className="btn-icono es-rojo"
                          onClick={() => editar(categoria)}
                          aria-label={`Editar ${categoria.nombre}`}
                          title="Editar"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn-icono"
                          onClick={() => setACambiar(categoria)}
                          aria-label={`${categoria.activa ? "Desactivar" : "Activar"} ${categoria.nombre}`}
                          title={categoria.activa ? "Desactivar" : "Activar"}
                        >
                          <Power size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {categorias.length === 0 && (
                  <tr>
                    <td colSpan="5" className="vacio">
                      Aún no hay categorías. Crea la primera para organizar tu menú.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="tabla-pie">
            <span>{categorias.length} categorías</span>
            <span>Acciones: editar · activar / desactivar</span>
          </div>
        </section>
      </div>
      {dialogo}
    </AppShell>
  );
}
