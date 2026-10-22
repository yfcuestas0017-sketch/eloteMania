import { useEffect, useMemo, useRef, useState } from "react";
import { MousePointerClick, TrendingUp } from "lucide-react";
import { pesos } from "../lib/formato";
import "./GraficaVentas.css";

const ZONA = "America/Bogota";

/* ---------- Utilidades de fecha (siempre en hora de Colombia) ---------- */

function partesBogota(fechaIso) {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false
  }).formatToParts(new Date(fechaIso));
  const g = (tipo) => partes.find((p) => p.type === tipo)?.value;
  return {
    dia: `${g("year")}-${g("month")}-${g("day")}`,
    hora: Number(g("hour")) % 24
  };
}

function enumerarDias(desde, hasta) {
  const dias = [];
  const cursor = new Date(`${desde}T12:00:00Z`);
  const fin = new Date(`${hasta}T12:00:00Z`);
  while (cursor <= fin && dias.length < 400) {
    dias.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dias;
}

function etiquetaDia(clave, opciones) {
  return new Date(`${clave}T12:00:00Z`).toLocaleDateString("es-CO", {
    timeZone: "UTC",
    ...opciones
  });
}

function etiquetaHora(h) {
  const sufijo = h < 12 ? "a. m." : "p. m.";
  return `${h % 12 || 12}:00 ${sufijo}`;
}

/* ---------- Matemática de la curva ---------- */

// Interpolación cúbica monótona: curva suave que nunca baja de cero.
function trazoSuave(pts) {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0].x},${pts[0].y}`;

  const dx = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x;
    m[i] = (pts[i + 1].y - pts[i].y) / dx[i];
  }

  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) {
      t[i] = 0;
    } else {
      t[i] =
        (3 * (dx[i - 1] + dx[i])) /
        ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
    }
  }
  t[n - 1] = m[n - 2];

  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    d += ` C${a.x + dx[i] / 3},${a.y + (t[i] * dx[i]) / 3} ${b.x - dx[i] / 3},${b.y - (t[i + 1] * dx[i]) / 3} ${b.x},${b.y}`;
  }
  return d;
}

function escalaY(max) {
  if (max <= 0) return { tope: 4, marcas: [0, 1, 2, 3, 4] };
  const bruto = max / 4;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const norm = bruto / mag;
  const bonito = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  const paso = bonito * mag;
  const tope = Math.ceil(max / paso) * paso;
  const marcas = [];
  for (let v = 0; v <= tope + 1e-6; v += paso) marcas.push(v);
  return { tope, marcas };
}

const compacto = new Intl.NumberFormat("es-CO", {
  notation: "compact",
  maximumFractionDigits: 1
});

function valorEje(v) {
  return v === 0 ? "$0" : `$${compacto.format(v)}`;
}

/* ---------- Componente ---------- */

export default function GraficaVentas({
  pedidos = [],
  desde,
  hasta,
  titulo = "Todos los cajeros",
  cargando = false,
  seleccion = null,
  onSeleccionar
}) {
  const contenedor = useRef(null);
  const [ancho, setAncho] = useState(640);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = contenedor.current;
    if (!el) return undefined;
    const observador = new ResizeObserver(([entrada]) => {
      setAncho(Math.max(240, Math.round(entrada.contentRect.width)));
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  const porHora = desde === hasta;

  // Un punto por día (o por hora si se consulta un solo día).
  const puntos = useMemo(() => {
    if (porHora) {
      const horas = pedidos.map((p) => partesBogota(p.fecha_venta).hora);
      const ini = Math.min(8, ...(horas.length ? horas : [8]));
      const fin = Math.max(20, ...(horas.length ? horas : [20]));
      const lista = [];
      for (let h = ini; h <= fin; h++) {
        lista.push({
          clave: String(h),
          eje1: `${h % 12 || 12}${h < 12 ? "a" : "p"}`,
          eje2: "",
          titulo: etiquetaHora(h),
          total: 0,
          pedidos: []
        });
      }
      pedidos.forEach((p) => {
        const punto = lista.find((x) => x.clave === String(partesBogota(p.fecha_venta).hora));
        if (punto) {
          punto.total += Number(p.total || 0);
          punto.pedidos.push(p);
        }
      });
      return lista;
    }

    const mapa = new Map(
      enumerarDias(desde, hasta).map((dia) => [
        dia,
        {
          clave: dia,
          eje1: etiquetaDia(dia, { weekday: "short" }).replace(".", ""),
          eje2: etiquetaDia(dia, { day: "numeric" }),
          titulo: etiquetaDia(dia, { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, ""),
          total: 0,
          pedidos: []
        }
      ])
    );
    pedidos.forEach((p) => {
      const punto = mapa.get(partesBogota(p.fecha_venta).dia);
      if (punto) {
        punto.total += Number(p.total || 0);
        punto.pedidos.push(p);
      }
    });
    return [...mapa.values()];
  }, [pedidos, desde, hasta, porHora]);

  const compactoMovil = ancho < 520;
  const alto = compactoMovil ? 240 : 310;
  const margen = { t: 22, r: compactoMovil ? 14 : 22, b: 46, l: compactoMovil ? 46 : 56 };
  const w = ancho - margen.l - margen.r;
  const h = alto - margen.t - margen.b;

  const maxValor = Math.max(0, ...puntos.map((p) => p.total));
  const { tope, marcas } = escalaY(maxValor);

  const coords = puntos.map((p, i) => ({
    x: margen.l + (puntos.length === 1 ? w / 2 : (i * w) / (puntos.length - 1)),
    y: margen.t + h - (p.total / tope) * h
  }));

  const linea = trazoSuave(coords);
  const base = margen.t + h;
  const area =
    coords.length > 1
      ? `${linea} L${coords[coords.length - 1].x},${base} L${coords[0].x},${base} Z`
      : "";

  // Etiquetas del eje X: se espacian para que nunca se amontonen.
  const pxPorPunto = puntos.length > 1 ? w / (puntos.length - 1) : w;
  const anchoEtiqueta = porHora ? 30 : 38;
  const salto = Math.max(1, Math.ceil(anchoEtiqueta / pxPorPunto));
  const visible = (i) => i % salto === 0;

  const indiceSel = seleccion === null ? -1 : puntos.findIndex((p) => p.clave === seleccion);
  const indiceActivo = hover !== null ? hover : indiceSel >= 0 ? indiceSel : null;
  const activo = indiceActivo !== null ? puntos[indiceActivo] : null;
  const puntoSel = indiceSel >= 0 ? puntos[indiceSel] : null;

  const totalPeriodo = puntos.reduce((s, p) => s + p.total, 0);

  function indiceCercano(evento) {
    const caja = evento.currentTarget.getBoundingClientRect();
    const x = evento.clientX - caja.left;
    if (puntos.length === 1) return 0;
    const i = Math.round(((x - margen.l) / w) * (puntos.length - 1));
    return Math.min(puntos.length - 1, Math.max(0, i));
  }

  function elegir(indice) {
    const punto = puntos[indice];
    if (!punto) return;
    setHover(null);
    onSeleccionar?.({
      clave: punto.clave,
      porHora,
      total: punto.total,
      pedidos: punto.pedidos,
      encabezado: porHora
        ? `Pedidos de ${punto.titulo} a ${etiquetaHora(Number(punto.clave)).replace(":00", ":59")}`
        : `Historial del ${etiquetaDia(punto.clave, { weekday: "long", day: "numeric", month: "long" })}`
    });
  }

  function teclado(e) {
    if (!puntos.length) return;
    const actual = indiceActivo ?? 0;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setHover(Math.min(puntos.length - 1, actual + 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setHover(Math.max(0, actual - 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      elegir(actual);
    }
  }

  // Posición de la burbuja blanca (se mantiene dentro de la tarjeta).
  const burbuja = activo
    ? {
        left: Math.min(Math.max(coords[indiceActivo].x, 70), ancho - 70),
        top: coords[indiceActivo].y,
        debajo: coords[indiceActivo].y < 70
      }
    : null;

  const hayVentas = totalPeriodo > 0;

  return (
    <section className="gv-tarjeta tarjeta no-imprimir" aria-label="Gráfica de ventas">
      <header className="gv-cabecera">
        <div className="gv-titulos">
          <span className="gv-icono" aria-hidden="true">
            <TrendingUp size={18} />
          </span>
          <div>
            <h2 className="gv-titulo">Ventas {porHora ? "por hora" : "por día"}</h2>
            <p className="gv-sub">{titulo}</p>
          </div>
        </div>

        <div className="gv-total">
          <span>Total del período</span>
          <strong>{pesos(totalPeriodo)}</strong>
        </div>
      </header>

      <div
        ref={contenedor}
        className="gv-lienzo"
        style={{ height: alto }}
        tabIndex={0}
        role="group"
        aria-label="Gráfica interactiva. Usa las flechas para moverte y Enter para ver el historial."
        onKeyDown={teclado}
        onBlur={() => setHover(null)}
      >
        <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} aria-hidden="true">
          <defs>
            <linearGradient id="gv-relleno" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d50918" stopOpacity="0.55" />
              <stop offset="60%" stopColor="#d50918" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#d50918" stopOpacity="0.02" />
            </linearGradient>
            <linearGradient id="gv-linea" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#d50918" />
              <stop offset="100%" stopColor="#ef4452" />
            </linearGradient>
          </defs>

          {/* Líneas horizontales y valores del eje Y */}
          {marcas.map((v) => {
            const y = margen.t + h - (v / tope) * h;
            return (
              <g key={v}>
                <line x1={margen.l} x2={ancho - margen.r} y1={y} y2={y} className="gv-rejilla" />
                <text x={margen.l - 10} y={y + 4} textAnchor="end" className="gv-eje">
                  {valorEje(v)}
                </text>
              </g>
            );
          })}

          {area && <path d={area} fill="url(#gv-relleno)" className="gv-area" />}
          {linea && coords.length > 1 && (
            <path d={linea} fill="none" stroke="url(#gv-linea)" strokeWidth="2.5" strokeLinecap="round" className="gv-trazo" />
          )}

          {/* Líneas punteadas verticales y etiquetas del eje X */}
          {puntos.map((p, i) =>
            visible(i) ? (
              <g key={p.clave}>
                <line x1={coords[i].x} x2={coords[i].x} y1={coords[i].y} y2={base} className="gv-punteada" />
                <text x={coords[i].x} y={base + 20} textAnchor="middle" className={`gv-eje gv-eje-x${i === indiceActivo ? " es-activo" : ""}`}>
                  {p.eje1}
                </text>
                {p.eje2 && (
                  <text x={coords[i].x} y={base + 35} textAnchor="middle" className={`gv-eje gv-eje-dia${i === indiceActivo ? " es-activo" : ""}`}>
                    {p.eje2}
                  </text>
                )}
              </g>
            ) : null
          )}

          {/* Puntitos de datos con ventas */}
          {puntos.map((p, i) =>
            p.total > 0 && coords.length <= 45 ? (
              <circle key={p.clave} cx={coords[i].x} cy={coords[i].y} r="3" className="gv-dato" />
            ) : null
          )}

          {/* Punto seleccionado (se queda marcado) */}
          {puntoSel && (
            <g>
              <line x1={coords[indiceSel].x} x2={coords[indiceSel].x} y1={margen.t} y2={base} className="gv-guia" />
              <circle cx={coords[indiceSel].x} cy={coords[indiceSel].y} r="11" className="gv-halo" />
            </g>
          )}

          {/* Puntito blanco que sigue el dedo o el mouse */}
          {activo && (
            <g>
              <circle cx={coords[indiceActivo].x} cy={coords[indiceActivo].y} r="9" className="gv-halo" />
              <circle cx={coords[indiceActivo].x} cy={coords[indiceActivo].y} r="5.5" className="gv-punto" />
            </g>
          )}

          {/* Capa que recibe mouse, dedo y clic */}
          <rect
            x={margen.l - 10}
            y={margen.t - 10}
            width={w + 20}
            height={h + 20 + 36}
            fill="transparent"
            className="gv-captura"
            onPointerMove={(e) => setHover(indiceCercano(e))}
            onPointerDown={(e) => setHover(indiceCercano(e))}
            onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
            onClick={(e) => elegir(indiceCercano(e))}
          />
        </svg>

        {burbuja && activo && (
          <div
            className={`gv-burbuja${burbuja.debajo ? " debajo" : ""}`}
            style={{ left: burbuja.left, top: burbuja.top }}
            aria-hidden="true"
          >
            <strong>{pesos(activo.total)}</strong>
            <span>
              {activo.titulo} · {activo.pedidos.length} {activo.pedidos.length === 1 ? "pedido" : "pedidos"}
            </span>
          </div>
        )}

        {!cargando && !hayVentas && (
          <p className="gv-vacio">Sin ventas en este período.</p>
        )}
      </div>

      {!puntoSel && hayVentas && (
        <p className="gv-pista">
          <MousePointerClick size={15} aria-hidden="true" />
          Toca o haz clic en un punto para ver abajo el historial de pedidos de ese {porHora ? "momento" : "día"}.
        </p>
      )}
    </section>
  );
}
