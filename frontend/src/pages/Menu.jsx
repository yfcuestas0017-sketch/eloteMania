import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LogIn, MessageCircle, Search, X } from "lucide-react";
import { apiFetch, formatearUrlImagen } from "../services/api";
import { pesos } from "../lib/formato";
import { NEGOCIO } from "../config/negocio";
import logo from "../assets/logo-elote-mania.png";
import "./Menu.css";

function normalizarTexto(str = "") {
  return String(str)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function estaProductoDisponible(producto) {
  if (producto.disponible === false) return false;
  if (producto.controla_inventario && Number(producto.stock_actual ?? 0) <= 0) {
    return false;
  }
  return true;
}

const SUGERENCIAS_POPULARES = ["Elotes", "Esquites", "Queso", "Tajín", "Dorilocos"];

export default function Menu() {
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [categoriaActiva, setCategoriaActiva] = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function cargarMenu() {
      try {
        const [listaProductos, listaCategorias] = await Promise.all([
          apiFetch("/products"),
          apiFetch("/categories")
        ]);

        setProductos(listaProductos.productos);
        setCategorias(listaCategorias.categorias);
      } catch (err) {
        setError(err.message);
      } finally {
        setCargando(false);
      }
    }

    cargarMenu();
  }, []);

  const productosFiltrados = useMemo(() => {
    const query = normalizarTexto(busqueda);
    const palabras = query.split(/\s+/).filter(Boolean);

    return productos.filter((producto) => {
      if (
        categoriaActiva !== "todas" &&
        String(producto.categoria_id) !== categoriaActiva
      ) {
        return false;
      }

      if (producto.activo === false) return false;

      if (palabras.length === 0) return true;

      const nombreNorm = normalizarTexto(producto.nombre);
      const descNorm = normalizarTexto(producto.descripcion || "");
      const catNorm = normalizarTexto(producto.categoria || "");
      const corpus = `${nombreNorm} ${descNorm} ${catNorm}`;

      return palabras.every((palabra) => corpus.includes(palabra));
    });
  }, [productos, categoriaActiva, busqueda]);

  function limpiarTodo() {
    setBusqueda("");
    setCategoriaActiva("todas");
  }

  return (
    <div className="menu-pagina">
      <header className="menu-barra">
        <Link to="/" className="menu-marca">
          <img src={logo} alt="" width="64" height="64" />
          <span>
            <strong>{NEGOCIO.nombre}</strong>
            <small>{NEGOCIO.eslogan}</small>
          </span>
        </Link>

        <div className="menu-contacto">
          <Link to="/login" className="btn btn-secundario">
            <LogIn size={18} aria-hidden="true" />
            Acceso del personal
          </Link>
        </div>
      </header>

      <div className="menu-contenido">
        <section className="menu-presentacion">
          <div>
            <p className="menu-etiqueta">Hecho al momento · Lleno de sabor</p>
            <h1>¿Qué se te antoja hoy?</h1>
            <p className="menu-intro">
              Elige tu favorito y pide en caja. No necesitas una cuenta.
            </p>
          </div>

          <div className="menu-servicio">
            <span className="menu-servicio-punto abierto" aria-hidden="true" />
            <div>
              <strong>Local abierto</strong>
              <small>Atendiendo en el local</small>
            </div>
          </div>
        </section>

        <section className="menu-catalogo">
          {/* BUSCADOR PÚBLICO MEJORADO */}
          <div className="menu-filtros">
            <div className="menu-busqueda-wrapper">
              <div className="menu-busqueda-caja">
                <Search size={20} className="menu-busqueda-icono" aria-hidden="true" />
                <input
                  type="text"
                  className="menu-busqueda-input"
                  placeholder="Buscar elotes, esquites, salsas, toppings…"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  aria-label="Buscar productos del menú"
                  autoComplete="off"
                  spellCheck="false"
                />
                {busqueda && (
                  <button
                    type="button"
                    className="menu-busqueda-limpiar"
                    onClick={() => setBusqueda("")}
                    aria-label="Borrar búsqueda"
                    title="Borrar búsqueda"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>

            <div className="menu-horario">
              <span>{NEGOCIO.direccion}</span>
            </div>
          </div>

          {/* Categorías */}
          <div
            className="menu-categorias"
            role="tablist"
            aria-label="Filtrar por categoría"
          >
            <button
              type="button"
              role="tab"
              aria-selected={categoriaActiva === "todas"}
              className={categoriaActiva === "todas" ? "activa" : ""}
              onClick={() => setCategoriaActiva("todas")}
            >
              Todo el menú
            </button>

            {categorias.map((categoria) => {
              const activa = String(categoria.categoria_id) === categoriaActiva;

              return (
                <button
                  key={categoria.categoria_id}
                  type="button"
                  role="tab"
                  aria-selected={activa}
                  className={activa ? "activa" : ""}
                  onClick={() =>
                    setCategoriaActiva(String(categoria.categoria_id))
                  }
                >
                  {categoria.nombre}
                </button>
              );
            })}
          </div>

          {/* Notificación activa de búsqueda */}
          {busqueda.trim() && (
            <div className="menu-alerta-busqueda">
              <span>
                Mostrando {productosFiltrados.length}{" "}
                {productosFiltrados.length === 1 ? "producto" : "productos"} para{" "}
                <strong>“{busqueda}”</strong>
              </span>
              <button type="button" onClick={() => setBusqueda("")}>
                Limpiar búsqueda ✕
              </button>
            </div>
          )}

          {!cargando && !error && !busqueda.trim() && (
            <div className="menu-conteo">
              <span>
                {productosFiltrados.length}{" "}
                {productosFiltrados.length === 1 ? "producto" : "productos"}
              </span>
              <span>Precios en COP</span>
            </div>
          )}

          {error && <p className="aviso aviso-error">{error}</p>}

          <div className="menu-grid" aria-busy={cargando}>
            {cargando &&
              Array.from({ length: 4 }, (_, i) => (
                <div className="menu-producto menu-esqueleto" key={i} aria-hidden="true">
                  <div className="menu-imagen" />
                  <div className="menu-producto-info">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              ))}

            {productosFiltrados.map((producto) => {
              const disponible = estaProductoDisponible(producto);

              return (
                <article
                  className={`menu-producto ${!disponible ? "agotado" : ""}`}
                  key={producto.producto_id}
                >
                  <div className="menu-imagen-contenedor">
                    {producto.imagen_url ? (
                      <img
                        className="menu-imagen"
                        src={formatearUrlImagen(producto.imagen_url)}
                        alt={producto.nombre}
                        loading="lazy"
                      />
                    ) : (
                      <div className="menu-imagen menu-imagen-vacia">
                        <img src={logo} alt="" width="72" height="72" />
                      </div>
                    )}

                    {!disponible && (
                      <span className="menu-imagen-tag-agotado">Agotado</span>
                    )}
                  </div>

                  <div className="menu-producto-info">
                    <h3>{producto.nombre}</h3>
                    <p>
                      {producto.descripcion || "Consulta este antojo en caja."}
                    </p>
                    <div className="menu-producto-pie">
                      <span className="menu-precio">{pesos(producto.precio)}</span>
                      <span
                        className={`menu-disponible ${
                          disponible ? "disponible" : "agotado"
                        }`}
                      >
                        {disponible ? "Disponible" : "Agotado"}
                      </span>
                    </div>
                  </div>
                </article>
              );
            })}

            {/* Estado amigable cuando no hay resultados de búsqueda */}
            {!cargando && !error && productosFiltrados.length === 0 && (
              <div className="menu-vacio-busqueda">
                <div className="menu-vacio-icono">
                  <Search size={28} aria-hidden="true" />
                </div>
                <h3>No encontramos productos que coincidan</h3>
                <p>
                  {busqueda.trim()
                    ? `No hay resultados para “${busqueda}”. Prueba con otra palabra clave como "elote", "esquite", "queso" o revisa otra categoría.`
                    : "No hay productos en esta categoría por el momento."}
                </p>
                <button
                  type="button"
                  className="btn btn-primario"
                  onClick={limpiarTodo}
                >
                  Ver todo el menú
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="menu-como-pedir">
          <div className="menu-como-pedir-caja">
            <div>
              <p className="menu-etiqueta">Fácil y rápido</p>
              <h2>¿Cómo ordenar?</h2>
              <p>
                Visítanos en {NEGOCIO.direccion}. Elige tus antojitos favoritos,
                haz tu pedido en la caja y recíbelo calientito con tu comprobante.
              </p>
            </div>
          </div>
        </section>
      </div>

      <footer className="menu-pie">
        <div>
          <p>
            <strong>{NEGOCIO.nombre}</strong> · {NEGOCIO.eslogan}
          </p>
          <small>
            Precios en pesos colombianos (COP). Los ingredientes pueden variar
            según disponibilidad.
          </small>
        </div>

        <Link to="/login" className="menu-enlace-acceso">
          Acceso del personal
        </Link>
      </footer>
    </div>
  );
}
