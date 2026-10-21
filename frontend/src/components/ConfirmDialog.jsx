import { useEffect, useRef } from "react";

// Diálogo de confirmación accesible basado en <dialog>.
export default function ConfirmDialog({
  abierto,
  titulo,
  texto,
  confirmar = "Confirmar",
  cancelar = "Cancelar",
  peligro = false,
  cargando = false,
  onConfirmar,
  onCancelar
}) {
  const ref = useRef(null);

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;

    if (abierto && !dialogo.open) dialogo.showModal();
    if (!abierto && dialogo.open) dialogo.close();
  }, [abierto]);

  return (
    <dialog
      ref={ref}
      className="dialogo"
      onCancel={(event) => {
        event.preventDefault();
        onCancelar?.();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onCancelar?.();
      }}
    >
      <div className="dialogo-cuerpo">
        <h2>{titulo}</h2>
        {texto && <p>{texto}</p>}

        <div className="dialogo-acciones">
          <button
            type="button"
            className="btn btn-secundario"
            onClick={onCancelar}
            disabled={cargando}
          >
            {cancelar}
          </button>
          <button
            type="button"
            className={`btn ${peligro ? "btn-peligro" : "btn-primario"}`}
            onClick={onConfirmar}
            disabled={cargando}
          >
            {cargando ? "Procesando..." : confirmar}
          </button>
        </div>
      </div>
    </dialog>
  );
}
