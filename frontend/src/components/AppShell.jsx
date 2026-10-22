import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  ArrowUpRight,
  ChartColumn,
  FileText,
  House,
  LogOut,
  Menu,
  ShoppingBasket,
  Tag,
  Users,
  Utensils,
  Sparkles,
  UserRound,
  X
} from "lucide-react";
import logo from "../assets/logo-elote-mania.png";
import { NEGOCIO } from "../config/negocio";
import { leerUsuario, nombreVisible } from "../lib/formato";
import "./AppShell.css";

const AREAS = {
  admin: {
    etiqueta: "Administración",
    enlaces: [
      { to: "/admin", texto: "Resumen", icono: ChartColumn, exacto: true },
      { to: "/admin/productos", texto: "Productos", icono: Utensils },
      { to: "/admin/adicionales", texto: "Adicionales", icono: Sparkles },
      { to: "/admin/categorias", texto: "Categorías", icono: Tag },
      { to: "/admin/usuarios", texto: "Usuarios", icono: Users },
      { to: "/admin/reportes", texto: "Reportes", icono: FileText }
    ]
  },
  caja: {
    etiqueta: "Caja y pedidos",
    enlaces: [
      { to: "/caja", texto: "Inicio", icono: House, exacto: true },
      { to: "/caja/ventas", texto: "Punto de venta", icono: ShoppingBasket },
      { to: "/caja/reportes", texto: "Reportes y pedidos", icono: FileText }
    ]
  }
};

const NOMBRE_ROL = { ADMIN: "Administrador", CAJERO: "Cajero" };

export default function AppShell({ area = "admin", seccion, children }) {
  const navigate = useNavigate();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const config = AREAS[area];
  const usuario = leerUsuario();
  const roles = Array.isArray(usuario.roles) ? usuario.roles : [];
  const rol = roles.includes("ADMIN") ? "ADMIN" : roles[0];

  function cerrarSesion() {
    localStorage.removeItem("pos_token");
    localStorage.removeItem("pos_user");
    navigate("/login", { replace: true });
  }

  return (
    <div className="shell">
      <aside
        className={`shell-lateral no-imprimir${menuAbierto ? " abierto" : ""}`}
        aria-label="Navegación principal"
      >
        <button
          type="button"
          className="shell-cerrar btn-icono"
          onClick={() => setMenuAbierto(false)}
          aria-label="Cerrar menú"
        >
          <X size={20} />
        </button>

        <Link to="/" className="shell-marca" aria-label="Ir al catálogo público">
          <img src={logo} alt={NEGOCIO.nombre} width="96" height="96" />
          <span>{config.etiqueta}</span>
        </Link>

        <nav className="shell-nav" onClick={() => setMenuAbierto(false)}>
          {config.enlaces.map(({ to, texto, icono: Icono, exacto }) => (
            <NavLink key={to} to={to} end={exacto} className="shell-enlace">
              <Icono size={18} aria-hidden="true" />
              {texto}
            </NavLink>
          ))}
        </nav>

        <Link to="/perfil" className="shell-publico shell-perfil">
          Mi perfil <UserRound size={13} aria-hidden="true" />
        </Link>

        <Link to="/" className="shell-publico">
          Ver catálogo público <ArrowUpRight size={13} aria-hidden="true" />
        </Link>

        <div className="shell-pie-lateral">
          <button type="button" onClick={cerrarSesion}>
            Cerrar sesión <LogOut size={13} aria-hidden="true" />
          </button>
        </div>
      </aside>

      {menuAbierto && (
        <button
          type="button"
          className="shell-velo no-imprimir"
          onClick={() => setMenuAbierto(false)}
          aria-label="Cerrar menú"
        />
      )}

      <div className="shell-cuerpo">
        <header className="shell-barra no-imprimir">
          <button
            type="button"
            className="shell-hamburguesa btn-icono"
            onClick={() => setMenuAbierto(true)}
            aria-label="Abrir menú"
          >
            <Menu size={22} />
          </button>

          <p className="shell-migas">
            {NEGOCIO.nombre} / {config.etiqueta}
            {seccion ? ` / ${seccion}` : ""}
          </p>

          <div className="shell-usuario">
            <span className="chip chip-verde">Local abierto</span>
            <Link
              to="/perfil"
              className="shell-usuario-enlace"
              aria-label="Ir a mi perfil"
              title="Mi perfil"
            >
              <UserRound size={16} aria-hidden="true" />
              <span className="shell-usuario-nombre">
                {nombreVisible(usuario)}
                {rol ? ` · ${NOMBRE_ROL[rol] || rol}` : ""}
              </span>
            </Link>
          </div>
        </header>

        <main className="shell-contenido">{children}</main>
        <footer className="shell-pie no-imprimir">
          <span>Precios en pesos colombianos (COP)</span>
          <span>
            {new Date().toLocaleDateString("es-CO", {
              day: "numeric",
              month: "short",
              year: "numeric"
            })}{" "}
            · {NEGOCIO.nombre}
          </span>
        </footer>
      </div>
    </div>
  );
}
