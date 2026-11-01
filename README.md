# EloteMania

Sistema POS para restaurante: backend Node/Express + PostgreSQL, frontend React/Vite.

- **Para desplegar en producción (Neon + Render + Vercel):** lee `GUIA-DESPLIEGUE.md`.
- **Desarrollo local:** copia `backend/.env.example` a `backend/.env` y `frontend/.env.example` a `frontend/.env`,
  luego `npm install` y `npm run dev` en cada carpeta.

```
backend/    API (Render)
frontend/   Web (Vercel)
database/   SQL y respaldo (Neon)
render.yaml Configuración automática de Render
```

## Caja e inventario

El cajero abre su caja antes de cobrar. Los ingresos y ganancias incluyen las ventas
vigentes de todos los medios de pago; el cierre físico usa únicamente apertura +
pedidos pagados en efectivo − egresos, porque los pagos digitales no están disponibles
en caja.
Al cerrar, se registra el efectivo total contado y por separado cuánto se deja en
caja para el siguiente día; solo ese monto pasa como apertura. El restante se considera
retirado. Si el cierre no cuadra, se debe dejar una observación.

El administrador define las existencias iniciales desde **Productos**. Al final del día,
el cajero compara el stock esperado con el conteo físico; cualquier diferencia exige una
observación y queda registrada como movimiento de inventario. La base de datos crea las
tablas de caja e inventario automáticamente al iniciar el backend.

Administración incluye **Inventario** para consultar existencias, registrar ajustes con
motivo y revisar movimientos; la creación y desactivación de artículos sigue en
**Productos**. **Caja diaria** permite consultar cada turno por fecha, con sus pedidos,
métodos de pago, egresos, apertura, efectivo contado, efectivo dejado y diferencias.
