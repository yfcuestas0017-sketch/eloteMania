import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { pesos } from "../lib/formato";
import "./AdicionalesSelector.css";

// Selector desplegable con barra de desplazamiento y buscador.
// Evita que la línea del pedido crezca cuando hay muchos adicionales.
export default function AdicionalesSelector({
  adicionales,
  seleccionados,
  onCambiar
}) {
  const [abierto, setAbierto] = useState(false);
  const [filtro, setFiltro] = useState("");
  const raiz = useRef(null);
  const idPanel = useId();

  useEffect(() => {
    if (!abierto) return undefined;

    function fuera(evento) {
      if (raiz.current && !raiz.current.contains(evento.target)) {
        setAbierto(false);
      }
    }

    function teclado(evento) {
      if (evento.key === "Escape") setAbierto(false);
    }

    document.addEventListener("pointerdown", fuera);
    document.addEventListener("keydown", teclado);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      document.removeEventListener("keydown", teclado);
    };
  }, [abierto]);

  const idsSeleccionados = useMemo(
    () => new Set(seleccionados.map((a) => Number(a.adicional_id))),
    [seleccionados]
  );

  const visibles = useMemo(() => {
    const texto = filtro.trim().toLowerCase();
    return texto
      ? adicionales.filter((a) => a.nombre.toLowerCase().includes(texto))
      : adicionales;
  }, [adicionales, filtro]);

  return (
    <div className="adic-selector" ref={raiz}>
      <button
        type="button"
        className="adic-boton"
        aria-expanded={abierto}
        aria-controls={idPanel}
        onClick={() => setAbierto((v) => !v)}
      >
        <span>
          {seleccionados.length === 0
            ? "Agregar adicionales"
            : `${seleccionados.length} adicional${
                seleccionados.length === 1 ? "" : "es"
              } elegido${seleccionados.length === 1 ? "" : "s"}`}
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      {abierto && (
        <div className="adic-panel" id={idPanel}>
          {adicionales.length > 6 && (
            <div className="adic-buscar">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                placeholder="Buscar adicional…"
                aria-label="Buscar adicional"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
              />
            </div>
          )}

          <ul className="adic-lista" role="listbox" aria-multiselectable="true">
            {visibles.map((adicional) => {
              const activo = idsSeleccionados.has(Number(adicional.adicional_id));

              return (
                <li key={adicional.adicional_id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={activo}
                    className={`adic-opcion${activo ? " activa" : ""}`}
                    onClick={() => onCambiar(adicional, !activo)}
                  >
                    <span className="adic-check" aria-hidden="true">
                      {activo && <Check size={12} />}
                    </span>
                    <span className="adic-nombre">{adicional.nombre}</span>
                    <strong>+ {pesos(adicional.precio)}</strong>
                  </button>
                </li>
              );
            })}

            {visibles.length === 0 && (
              <li className="adic-vacio">Sin resultados.</li>
            )}
          </ul>
        </div>
      )}

      {seleccionados.length > 0 && (
        <ul className="adic-chips" aria-label="Adicionales elegidos">
          {seleccionados.map((adicional) => (
            <li key={adicional.adicional_id}>
              <span>{adicional.nombre}</span>
              <button
                type="button"
                onClick={() => onCambiar(adicional, false)}
                aria-label={`Quitar ${adicional.nombre}`}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
