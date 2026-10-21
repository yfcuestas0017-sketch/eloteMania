import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, Search, Trash, Trash2, Upload } from "lucide-react";
import AppShell from "../components/AppShell";
import ConfirmDialog from "../components/ConfirmDialog";
import { apiFetch, formatearUrlImagen, subirFotoProducto } from "../services/api";
import { pesos } from "../lib/formato";
import logo from "../assets/logo-elote-mania.png";
import "./admin.css";

const formularioInicial = {
  nombre: "",
  descripcion: "",
  precio: "",
  categoria_id: "",
  imagen_url: "",
  controla_inventario: true,
  stock_actual: "0",
  stock_minimo: "5",
  disponible: true
};

function estadoProducto(producto) {
  if (producto.eliminado_en) return { texto: "Desactivado", clase: "" };
  if (!producto.disponible) return { texto: "No disponible", clase: "chip-ambar" };
  return { texto: "Disponible", clase: "chip-verde" };
}

function estaActivo(producto) {
  return producto.disponible && !producto.eliminado_en;
}

export default function AdminProducts() {
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [formulario, setFormulario] = useState(formularioInicial);
  const [archivoFoto, setArchivoFoto] = useState(null);
  const [vistaPreviaFoto, setVistaPreviaFoto] = useState("");
  const [vista, setVista] = useState("lista");
  const [editando, setEditando] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [aDesactivar, setADesactivar] = useState(null);
  const [aEliminar, setAEliminar] = useState(null);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function cargarDatos() {
    try {
      const [listaProductos, listaCategorias] = await Promise.all([
        apiFetch("/products/admin"),
        apiFetch("/categories/admin")
      ]);

      setProductos(listaProductos.productos);
      setCategorias(listaCategorias.categorias);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    cargarDatos();
  }, []);

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    return productos.filter((producto) => {
      if (
        texto &&
        !`${producto.nombre} ${producto.codigo || ""}`.toLowerCase().includes(texto)
      ) {
        return false;
      }

      if (filtroCategoria && String(producto.categoria_id) !== filtroCategoria) {
        return false;
      }

      if (filtroEstado === "disponibles" && !estaActivo(producto)) return false;
      if (filtroEstado === "no-disponibles" && estaActivo(producto)) return false;

      return true;
    });
  }, [productos, busqueda, filtroCategoria, filtroEstado]);

  const totalDisponibles = productos.filter(estaActivo).length;

  function cambiarCampo(event) {
    setFormulario({
      ...formulario,
      [event.target.name]: event.target.value
    });
  }

  function manejarSeleccionFoto(event) {
    const archivo = event.target.files?.[0];
    if (!archivo) return;

    if (!archivo.type.startsWith("image/")) {
      setError("Por favor selecciona un archivo de imagen (PNG, JPG, WEBP, GIF).");
      return;
    }

    if (archivo.size > 5 * 1024 * 1024) {
      setError("La imagen no debe superar los 5 MB.");
      return;
    }

    setError("");
    setArchivoFoto(archivo);
    setVistaPreviaFoto(URL.createObjectURL(archivo));
  }

  function quitarFoto() {
    setArchivoFoto(null);
    setVistaPreviaFoto("");
    setFormulario((prev) => ({ ...prev, imagen_url: "" }));
  }

  function nuevoProducto() {
    setEditando(null);
    setFormulario(formularioInicial);
    setArchivoFoto(null);
    setVistaPreviaFoto("");
    setError("");
    setVista("formulario");
  }

  function editarProducto(producto) {
    setEditando(producto);
    setFormulario({
      nombre: producto.nombre || "",
      descripcion: producto.descripcion || "",
      precio: String(producto.precio ?? ""),
      categoria_id: String(producto.categoria_id || ""),
      imagen_url: producto.imagen_url || "",
      controla_inventario: Boolean(producto.controla_inventario),
      stock_actual: String(producto.stock_actual ?? 0),
      stock_minimo: String(producto.stock_minimo ?? 0),
      disponible: Boolean(producto.disponible)
    });
    setArchivoFoto(null);
    setVistaPreviaFoto("");
    setError("");
    setVista("formulario");
  }

  function volverALista() {
    setVista("lista");
    setEditando(null);
    setFormulario(formularioInicial);
    setArchivoFoto(null);
    setVistaPreviaFoto("");
    setError("");
  }

  async function guardarProducto(event) {
    event.preventDefault();
    setError("");
    setCargando(true);

    try {
      let urlFoto = formulario.imagen_url ? formulario.imagen_url.trim() : null;

      // Si el usuario seleccionó un archivo local, lo subimos primero al servidor
      if (archivoFoto) {
        const respuestaSubida = await subirFotoProducto(archivoFoto);
        urlFoto = respuestaSubida.url;
      }

      const datos = {
        nombre: formulario.nombre.trim(),
        descripcion: formulario.descripcion,
        precio: Number(formulario.precio),
        categoria_id: Number(formulario.categoria_id),
        imagen_url: urlFoto || null,
        disponible: Boolean(formulario.disponible),
        controla_inventario: Boolean(formulario.controla_inventario),
        stock_actual: Number(formulario.stock_actual || 0),
        stock_minimo: Number(formulario.stock_minimo || 0),
        codigo: editando?.codigo || null,
        unidad_medida: editando?.unidad_medida || "unidad"
      };

      if (
        !datos.nombre ||
        !Number.isFinite(datos.precio) ||
        datos.precio < 0 ||
        !datos.categoria_id
      ) {
        throw new Error("Verifica el nombre, el precio y la categoría.");
      }

      const ruta = editando ? `/products/${editando.producto_id}` : "/products";

      await apiFetch(ruta, {
        method: editando ? "PUT" : "POST",
        body: JSON.stringify(datos)
      });

      volverALista();
      await cargarDatos();
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  async function desactivarProducto() {
    if (!aDesactivar) return;
    setCargando(true);

    try {
      await apiFetch(`/products/${aDesactivar.producto_id}/estado`, {
        method: "PATCH"
      });
      setADesactivar(null);
      if (vista === "formulario") volverALista();
      await cargarDatos();
    } catch (err) {
      setADesactivar(null);
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  async function eliminarProducto() {
    if (!aEliminar) return;
    setCargando(true);

    try {
      await apiFetch(`/products/${aEliminar.producto_id}`, { method: "DELETE" });
      setAEliminar(null);
      await cargarDatos();
    } catch (err) {
      setAEliminar(null);
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  const nombreCategoria = (id) =>
    categorias.find((c) => String(c.categoria_id) === String(id))?.nombre || "Sin categoría";

  const dialogo = (
    <>
      <ConfirmDialog
        abierto={Boolean(aDesactivar)}
        titulo={`¿Desactivar ${aDesactivar?.nombre || "el producto"}?`}
        texto="Se retirará del catálogo y del punto de venta. Los pedidos anteriores conservarán su detalle."
        confirmar="Sí, desactivar"
        cancelar="Conservar"
        peligro
        cargando={cargando}
        onConfirmar={desactivarProducto}
        onCancelar={() => setADesactivar(null)}
      />
      <ConfirmDialog
        abierto={Boolean(aEliminar)}
        titulo={`¿Eliminar permanentemente ${aEliminar?.nombre || "el producto"}?`}
        texto="Esta acción no se puede deshacer. Solo se eliminará si no tiene movimientos de inventario ni adicionales asociados."
        confirmar="Eliminar permanentemente"
        cancelar="Cancelar"
        peligro
        cargando={cargando}
        onConfirmar={eliminarProducto}
        onCancelar={() => setAEliminar(null)}
      />
    </>
  );

  /* ---------------- Formulario ---------------- */

  if (vista === "formulario") {
    return (
      <AppShell area="admin" seccion="Productos">
        <div className="pagina">
          <header className="pagina-cabecera">
            <div>
              <h1 className="pagina-titulo">
                {editando ? "Editar producto" : "Nuevo producto"}
              </h1>
              <p className="pagina-sub">
                Productos
                {editando &&
                  ` / ${editando.nombre}${editando.codigo ? ` · Código ${editando.codigo}` : ""}`}
              </p>
            </div>
          </header>

          {error && <p className="aviso aviso-error" role="alert">{error}</p>}

          <form className="formulario-rejilla" onSubmit={guardarProducto}>
            <section className="tarjeta formulario-principal">
              <h2 className="tarjeta-titulo">Información del producto</h2>

              <div className="campo">
                <label htmlFor="p-nombre">Nombre del producto *</label>
                <input
                  id="p-nombre"
                  className="entrada"
                  name="nombre"
                  value={formulario.nombre}
                  onChange={cambiarCampo}
                  required
                />
              </div>

              <div className="campo">
                <label htmlFor="p-descripcion">Descripción</label>
                <textarea
                  id="p-descripcion"
                  className="area-texto"
                  name="descripcion"
                  value={formulario.descripcion}
                  onChange={cambiarCampo}
                />
                <span className="campo-ayuda">
                  Esta descripción se muestra en el catálogo público.
                </span>
              </div>

              <div className="rejilla-2">
                <div className="campo">
                  <label htmlFor="p-categoria">Categoría *</label>
                  <select
                    id="p-categoria"
                    className="seleccion"
                    name="categoria_id"
                    value={formulario.categoria_id}
                    onChange={cambiarCampo}
                    required
                  >
                    <option value="">Selecciona una categoría</option>
                    {categorias.map((categoria) => (
                      <option key={categoria.categoria_id} value={categoria.categoria_id}>
                        {categoria.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="campo">
                  <label htmlFor="p-precio">Precio de venta (COP) *</label>
                  <input
                    id="p-precio"
                    className="entrada"
                    name="precio"
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    value={formulario.precio}
                    onChange={cambiarCampo}
                    required
                  />
                  <span className="campo-ayuda">Precio final que se cobra al cliente.</span>
                </div>
              </div>

              {/* SECCIÓN DE INVENTARIO Y STOCK DIRECTO */}
              <div className="campo" style={{ marginTop: 6 }}>
                <span className="campo-etiqueta">Gestión de inventario</span>
                <label
                  className={`interruptor${formulario.controla_inventario ? " activo" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={formulario.controla_inventario}
                    onChange={(e) =>
                      setFormulario({ ...formulario, controla_inventario: e.target.checked })
                    }
                  />
                  <i aria-hidden="true" />
                  {formulario.controla_inventario
                    ? "Controlar existencias / stock"
                    : "Sin límite de stock"}
                </label>
                <span className="campo-ayuda">
                  Si está activo, cada venta restará automáticamente del stock disponible.
                </span>
              </div>

              {formulario.controla_inventario && (
                <div className="rejilla-2" style={{ marginTop: 4 }}>
                  <div className="campo">
                    <label htmlFor="p-stock">
                      {editando
                        ? "Stock disponible actual (unidades) *"
                        : "Stock inicial (unidades) *"}
                    </label>
                    <input
                      id="p-stock"
                      className="entrada"
                      name="stock_actual"
                      type="number"
                      min="0"
                      step="1"
                      value={formulario.stock_actual}
                      onChange={cambiarCampo}
                      placeholder="Ej: 50"
                      required
                    />
                    <span className="campo-ayuda">
                      {editando
                        ? "Puedes colocar o ajustar el stock directamente aquí."
                        : "Coloca la cantidad inicial disponible sin crear inventario manual."}
                    </span>
                  </div>

                  <div className="campo">
                    <label htmlFor="p-stock-minimo">Stock mínimo de alerta</label>
                    <input
                      id="p-stock-minimo"
                      className="entrada"
                      name="stock_minimo"
                      type="number"
                      min="0"
                      step="1"
                      value={formulario.stock_minimo}
                      onChange={cambiarCampo}
                      placeholder="Ej: 5"
                    />
                    <span className="campo-ayuda">
                      Alerta cuando las existencias estén bajas.
                    </span>
                  </div>
                </div>
              )}

              <div className="campo" style={{ marginTop: 6 }}>
                <span className="campo-etiqueta">Disponibilidad en catálogo</span>
                <label
                  className={`interruptor${formulario.disponible ? " activo" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={formulario.disponible}
                    onChange={(e) =>
                      setFormulario({ ...formulario, disponible: e.target.checked })
                    }
                  />
                  <i aria-hidden="true" />
                  {formulario.disponible ? "Disponible para la venta" : "No disponible"}
                </label>
                <span className="campo-ayuda">Si lo desactivas, no aparecerá en el menú.</span>
              </div>

              <div className="formulario-pie">
                <span className="campo-ayuda">* Campos obligatorios</span>
                <div className="acciones">
                  <button type="button" className="btn btn-secundario" onClick={volverALista}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primario" disabled={cargando}>
                    <Check size={16} aria-hidden="true" />
                    {cargando
                      ? "Guardando..."
                      : editando
                        ? "Guardar cambios"
                        : "Crear producto"}
                  </button>
                </div>
              </div>
            </section>

            <aside className="formulario-lateral">
              <section className="tarjeta tarjeta-pila">
                <h2 className="tarjeta-titulo">Foto del producto</h2>

                {vistaPreviaFoto || formulario.imagen_url ? (
                  <img
                    className="foto-vista"
                    src={vistaPreviaFoto || formatearUrlImagen(formulario.imagen_url)}
                    alt="Vista previa de la foto"
                  />
                ) : (
                  <div className="foto-vacia">
                    <img src={logo} alt="" />
                  </div>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input
                    id="p-foto-archivo"
                    type="file"
                    accept="image/png, image/jpeg, image/webp, image/gif"
                    onChange={manejarSeleccionFoto}
                    style={{ display: "none" }}
                  />

                  <label
                    htmlFor="p-foto-archivo"
                    className="btn btn-secundario"
                    style={{
                      flex: 1,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      cursor: "pointer"
                    }}
                  >
                    <Upload size={16} aria-hidden="true" />
                    {vistaPreviaFoto || formulario.imagen_url ? "Cambiar foto" : "Seleccionar foto"}
                  </label>

                  {(vistaPreviaFoto || formulario.imagen_url) && (
                    <button
                      type="button"
                      className="btn btn-secundario btn-icono"
                      onClick={quitarFoto}
                      title="Quitar foto"
                      aria-label="Quitar foto"
                    >
                      <Trash size={16} />
                    </button>
                  )}
                </div>

                {archivoFoto ? (
                  <p className="campo-ayuda" style={{ color: "var(--verde)", fontWeight: 700 }}>
                    ✓ Foto lista: {archivoFoto.name} ({Math.round(archivoFoto.size / 1024)} KB)
                  </p>
                ) : (
                  <span className="campo-ayuda">
                    Selecciona una foto desde tu equipo (JPG, PNG o WEBP, máx. 5 MB).
                  </span>
                )}
              </section>

              <section className="tarjeta tarjeta-crema tarjeta-pila tarjeta-vista">
                <h2 className="tarjeta-titulo">Vista previa del catálogo</h2>
                <h3>{formulario.nombre || "Nombre del producto"}</h3>
                <p>{formulario.descripcion || "La descripción aparecerá aquí."}</p>
                <div className="fila">
                  <span className="precio">{pesos(formulario.precio)}</span>
                  <span className={`chip ${formulario.disponible ? "chip-verde" : ""}`}>
                    {formulario.disponible ? "Disponible" : "No disponible"}
                  </span>
                </div>
                {formulario.controla_inventario && (
                  <small style={{ color: "var(--apagado)", marginTop: 4 }}>
                    Stock asignado: {formulario.stock_actual} unidades
                  </small>
                )}
              </section>
            </aside>
          </form>

          {editando && estaActivo(editando) && (
            <section className="franja-peligro">
              <div>
                <strong>¿Desactivar {editando.nombre}?</strong>
                <p>
                  Se retirará del catálogo y del punto de venta. Los pedidos anteriores
                  conservarán su detalle.
                </p>
              </div>
              <div className="acciones">
                <button
                  type="button"
                  className="btn btn-peligro"
                  onClick={() => setADesactivar(editando)}
                >
                  <Trash size={16} aria-hidden="true" />
                  Desactivar producto
                </button>
              </div>
            </section>
          )}
        </div>
        {dialogo}
      </AppShell>
    );
  }

  /* ---------------- Lista ---------------- */

  return (
    <AppShell area="admin" seccion="Productos">
      <div className="pagina">
        <header className="pagina-cabecera">
          <div>
            <h1 className="pagina-titulo">Productos</h1>
            <p className="pagina-sub">
              Tu menú, siempre listo. Administra precios, fotos y stock directamente.
            </p>

            <div className="pagina-pastillas">
              <span className="chip">{productos.length} productos</span>
              <span className="chip chip-verde">{totalDisponibles} disponibles</span>
              <span className="chip chip-ambar">
                {productos.length - totalDisponibles} no disponibles
              </span>
              <span className="campo-ayuda">
                Los cambios se reflejan en el catálogo y en el punto de venta.
              </span>
            </div>
          </div>

          <button type="button" className="btn btn-primario" onClick={nuevoProducto}>
            <Plus size={16} aria-hidden="true" />
            Crear producto
          </button>
        </header>

        {error && <p className="aviso aviso-error" role="alert">{error}</p>}

        <section className="tarjeta">
          <div className="herramientas">
            <div className="busqueda">
              <Search size={18} aria-hidden="true" />
              <input
                className="entrada"
                type="search"
                placeholder="Buscar nombre o código…"
                aria-label="Buscar producto"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>

            <select
              className="seleccion"
              aria-label="Filtrar por categoría"
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
            >
              <option value="">Todas las categorías</option>
              {categorias.map((categoria) => (
                <option key={categoria.categoria_id} value={categoria.categoria_id}>
                  {categoria.nombre}
                </option>
              ))}
            </select>

            <select
              className="seleccion"
              aria-label="Filtrar por disponibilidad"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
            >
              <option value="">Disponibilidad: todas</option>
              <option value="disponibles">Disponibles</option>
              <option value="no-disponibles">No disponibles</option>
            </select>
          </div>

          <div className="tabla-contenedor tabla-tarjetas-contenedor">
            <table className="tabla tabla-tarjetas">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Categoría</th>
                  <th>Precio COP</th>
                  <th>Stock disponible</th>
                  <th>Disponibilidad</th>
                  <th>Acciones</th>
                </tr>
              </thead>

              <tbody>
                {filtrados.map((producto) => {
                  const estado = estadoProducto(producto);
                  const stockNum = Number(producto.stock_actual ?? 0);
                  const stockMin = Number(producto.stock_minimo ?? 0);
                  const bajoStock = producto.controla_inventario && stockNum <= stockMin;

                  return (
                    <tr key={producto.producto_id}>
                      <td className="celda-titulo">
                        <div className="celda-producto">
                          {producto.imagen_url ? (
                            <img
                              className="miniatura"
                              src={formatearUrlImagen(producto.imagen_url)}
                              alt=""
                              loading="lazy"
                            />
                          ) : (
                            <img className="miniatura" src={logo} alt="" />
                          )}
                          <div>
                            <strong>{producto.nombre}</strong>
                            {producto.codigo && <small>{producto.codigo}</small>}
                          </div>
                        </div>
                      </td>
                      <td data-label="Categoría">{producto.categoria || nombreCategoria(producto.categoria_id)}</td>
                      <td data-label="Precio">{pesos(producto.precio)}</td>
                      <td data-label="Stock">
                        {producto.controla_inventario ? (
                          <span
                            style={{
                              fontWeight: 700,
                              color: bajoStock ? "var(--rojo)" : "inherit"
                            }}
                          >
                            {stockNum} uds
                            {bajoStock && (
                              <span
                                className="chip chip-ambar"
                                style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px" }}
                              >
                                Bajo
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="apagado">Sin límite</span>
                        )}
                      </td>
                      <td data-label="Disponibilidad">
                        <span className={`chip ${estado.clase}`}>{estado.texto}</span>
                      </td>
                      <td className="celda-acciones">
                        <div className="acciones">
                          <button
                            type="button"
                            className="btn-icono es-rojo"
                            onClick={() => editarProducto(producto)}
                            aria-label={`Editar ${producto.nombre}`}
                            title="Editar producto y stock"
                          >
                            <Pencil size={16} />
                          </button>

                          {estaActivo(producto) && (
                            <button
                              type="button"
                              className="btn-icono"
                              onClick={() => setADesactivar(producto)}
                              aria-label={`Desactivar ${producto.nombre}`}
                              title="Desactivar"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn-icono es-rojo"
                            onClick={() => setAEliminar(producto)}
                            aria-label={`Eliminar permanentemente ${producto.nombre}`}
                            title="Eliminar permanentemente"
                          >
                            <Trash size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan="6" className="vacio">
                      {productos.length === 0
                        ? "Aún no hay productos. Crea el primero con el botón “Crear producto”."
                        : "Ningún producto coincide con los filtros."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="tabla-pie">
            <span>
              Mostrando {filtrados.length} de {productos.length} productos
            </span>
            <span>Acciones: editar · desactivar · eliminar permanentemente</span>
          </div>
        </section>
      </div>
      {dialogo}
    </AppShell>
  );
}
