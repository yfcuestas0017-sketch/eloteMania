# EloteMania — Guía de despliegue en producción

**Arquitectura final**

```
Navegador ──► Vercel (frontend React/Vite)
                  │  fetch  VITE_API_URL
                  ▼
              Render (backend Node/Express) ──► Cloudinary (fotos de productos)
                  │  DATABASE_URL
                  ▼
              Neon (PostgreSQL)
```

**Orden obligatorio:** Neon → Cloudinary → GitHub → Render → Vercel → volver a Render (CORS).
Cada servicio necesita una URL del anterior.

---

## Qué cambié en tu proyecto (y por qué)

| Archivo | Cambio | Motivo |
|---|---|---|
| `backend/src/routes/upload.routes.js` | Las fotos se suben a **Cloudinary** si hay variables `CLOUDINARY_*`; si no, usa `/uploads` como antes | El disco de Render **se borra** en cada despliegue/reinicio: las fotos desaparecerían |
| `backend/src/config/db.js` | SSL automático con `sslmode=require` y timeout de conexión de 5 s → 15 s | Neon exige SSL y tarda ~1 s en "despertar" tras inactividad |
| `backend/package.json` | `engines: node >= 20` | Fija una versión de Node compatible |
| `backend/.env.example` | Nuevo | Plantilla de variables (el `.env` real **no** va en el zip ni en Git) |
| `frontend/vercel.json` | Nuevo | Sin esto, recargar `/login` o `/admin/...` da 404 en Vercel |
| `frontend/.env.example` | Nuevo | Plantilla de `VITE_API_URL` |
| `render.yaml` | Nuevo | Configuración automática del servicio en Render |
| `database/neon-esquema-inicial.sql` | Nuevo | Esquema + roles + métodos de pago + adicionales, listo para Neon |
| `database/solo-desarrollo/restablecer-claves.sql` | Movido | Pone contraseñas de ejemplo (`Admin12345`). **Nunca ejecutarlo en producción** |

> **Seguridad:** tu `.env` local tenía un `JWT_SECRET` de solo 14 caracteres. En producción se usa uno
> nuevo, largo y aleatorio (Render lo genera solo con el `render.yaml`). No reutilices el de desarrollo.

---

## Paso 0 — Requisitos previos

- Cuenta en [GitHub](https://github.com), [Neon](https://neon.tech), [Render](https://render.com),
  [Vercel](https://vercel.com) y [Cloudinary](https://cloudinary.com) (todas tienen plan gratuito).
- [Git](https://git-scm.com) y [Node.js 20+](https://nodejs.org) instalados en tu PC.
- Herramientas de PostgreSQL en tu PC (`pg_dump`, `pg_restore`, `psql`). Ya las tienes si instalaste
  PostgreSQL/pgAdmin (carpeta `C:\Program Files\PostgreSQL\16\bin`). **Son opcionales**
  si usas la Opción B del Paso 1.

---

## Paso 1 — Base de datos en Neon

### 1.1 Crear el proyecto

1. Entra a <https://console.neon.tech> → **New Project**.
2. **Name:** `elotemania`.
3. **Postgres version:** `16` (o `17`). Debe ser **igual o mayor** a la de tu PostgreSQL local (el backup indica 16.4).
4. **Region:** **AWS US East 1 (N. Virginia)**. Es la que mejor combina con Render *Virginia*
   (el tráfico backend ↔ base de datos es el más frecuente, conviene que estén juntos).
5. **Create**.

### 1.2 Copiar la cadena de conexión

1. En el panel del proyecto pulsa **Connect**.
2. Desactiva el interruptor **Connection pooling** (usa la conexión directa).
3. Copia la cadena. Se ve así:

   ```
   postgresql://neondb_owner:CLAVE@ep-xxxx-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require
   ```

4. Si termina con `&channel_binding=require`, **bórralo** (el driver `pg` no lo necesita).

Guárdala en un bloc de notas: es tu `DATABASE_URL` (la usarás en 1.3, 1.4 y en Render). **No la subas a GitHub.**

### 1.3 Cargar la base de datos — elige UNA opción

#### Opción A (recomendada si ya tienes datos reales): copiar tu base local actual

Tu `EloteMania.backup` es del **12 de octubre** y no trae productos ni categorías (solo roles y métodos de pago).
Si en tu PC ya cargaste productos, categorías, usuarios, etc., copia tu base **actual**.

En PowerShell:

```powershell
# 1) Respaldo de tu base local ACTUAL
& "C:\Program Files\PostgreSQL\16\bin\pg_dump.exe" -h localhost -U postgres -d EloteMania -Fc --no-owner --no-privileges -f EloteMania-local.backup

# 2) Restaurar en Neon (pega tu cadena entre comillas)
& "C:\Program Files\PostgreSQL\16\bin\pg_restore.exe" --no-owner --no-privileges -d "postgresql://neondb_owner:CLAVE@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require" EloteMania-local.backup
```

Mac/Linux: mismos comandos sin `&` ni la ruta de Windows.

- Los usuarios y contraseñas se conservan: podrás entrar con las mismas credenciales de tu entorno local.
- **Revisa las fotos** (ver Paso 1.5).
- Verifica que tu base local ya tenga las tablas de adicionales:
  `psql -U postgres -d EloteMania -c "\dt adicionales*"`. Si faltan, ejecuta también `database/adicionales-pedido.sql` en Neon (Paso B.2).

#### Opción B: base nueva y limpia (sin datos de prueba)

**B.1** Abre Neon → **SQL Editor**, pega el contenido de `database/neon-esquema-inicial.sql` y pulsa **Run**.
O desde PowerShell:

```powershell
& "C:\Program Files\PostgreSQL\16\bin\psql.exe" "TU_CADENA_NEON" -v ON_ERROR_STOP=1 -f database\neon-esquema-inicial.sql
```

Crea 18 tablas, las funciones (`confirmar_venta`, `entregar_pedido`, …), los 3 roles (ADMIN, CAJERO, CLIENTE)
y los 5 métodos de pago. **No** trae usuarios.

**B.2** *(Solo si usaste `EloteMania.backup` en lugar del SQL anterior)* ejecuta después, **en este orden**:

```powershell
& "...\pg_restore.exe" --no-owner --no-privileges -d "TU_CADENA_NEON" database\EloteMania.backup
& "...\psql.exe" "TU_CADENA_NEON" -v ON_ERROR_STOP=1 -f database\adicionales-pedido.sql
```

El orden importa: `adicionales-pedido.sql` reemplaza la función `confirmar_venta` por la versión que
soporta adicionales. Además, el backup trae dos usuarios de ejemplo con hash inválido (`admin_user`, `cajero_user`);
bórralos o ignóralos.

> ⚠️ No ejecutes `pg_restore` dos veces sobre la misma base: la segunda vez da decenas de errores
> "already exists". Si te equivocas, en Neon: **Branches → Reset** o crea otro proyecto.

### 1.4 Crear el usuario administrador (solo en la Opción B)

Desde la carpeta `backend` de tu PC (se conecta directo a Neon):

```powershell
cd backend
npm install
$env:DATABASE_URL = "TU_CADENA_NEON"
npm run crear-admin
```

Te pregunta nombres, apellidos, usuario y contraseña (**mínimo 12 caracteres**).
Cierra la terminal después para que la variable no quede guardada.

### 1.5 Fotos que apunten a `/uploads/...`

En la Opción A, tus productos pueden tener fotos guardadas como `/uploads/prod-….jpg`.
Esas rutas **no existirán** en Render. Para listarlas, en el SQL Editor de Neon:

```sql
SELECT producto_id, nombre, imagen_url
FROM productos
WHERE imagen_url LIKE '/uploads/%';
```

Después del despliegue, entra como administrador, edita cada producto y vuelve a subir su foto
(ahora irá a Cloudinary). Tu archivo local `backend/uploads/prod-1792511880797-799284.jpg` sirve para eso.

---

## Paso 2 — Cloudinary (fotos de productos)

1. Crea la cuenta en <https://cloudinary.com> (plan gratuito).
2. En el **Dashboard / API Keys** copia: **Cloud name**, **API Key** y **API Secret**.

No necesitas crear presets ni carpetas: el backend sube firmado a la carpeta `elotemania`.

---

## Paso 3 — Subir el proyecto a GitHub

Render y Vercel despliegan desde un repositorio. Descomprime el zip y, **en la carpeta `elotemania`**:

```bash
git init
git add .
git status          # comprueba que NO aparezcan .env, node_modules ni dist
git commit -m "EloteMania: versión para producción"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/elotemania.git
git push -u origin main
```

(Crea antes el repositorio vacío en GitHub, preferiblemente **privado**.)
El `.gitignore` ya excluye `.env`, `node_modules`, `dist` y fotos locales.

---

## Paso 4 — Backend en Render

### Opción rápida: Blueprint (usa el `render.yaml`)

1. Render → **New +** → **Blueprint** → conecta GitHub y elige el repositorio.
2. Render lee `render.yaml` y te pide los valores de las variables marcadas como secretas:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | Tu cadena de Neon (Paso 1.2) |
| `FRONTEND_URL` | Por ahora `https://pendiente.vercel.app` (se corrige en el Paso 6) |
| `CLOUDINARY_CLOUD_NAME` | Del Paso 2 |
| `CLOUDINARY_API_KEY` | Del Paso 2 |
| `CLOUDINARY_API_SECRET` | Del Paso 2 |

   `JWT_SECRET` lo genera Render automáticamente.
3. **Apply** y espera el primer despliegue (2–4 min).

### Opción manual (si prefieres no usar Blueprint)

Render → **New +** → **Web Service** → tu repositorio:

| Campo | Valor |
|---|---|
| Name | `elotemania-api` |
| Region | Virginia (US East) |
| Branch | `main` |
| **Root Directory** | `backend` |
| Runtime | Node |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Instance Type | Free (o Starter) |

En **Environment** agrega:

```
NODE_ENV=production
NODE_VERSION=22
DATABASE_URL=<cadena de Neon>
JWT_SECRET=<aleatorio de 64+ caracteres>
JWT_EXPIRES_IN=8h
FRONTEND_URL=https://pendiente.vercel.app
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
CLOUDINARY_FOLDER=elotemania
```

Para generar un `JWT_SECRET` seguro:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

No definas `PORT`: Render lo asigna solo y el servidor ya lo lee.

### Verificar el backend

Abre en el navegador (cambia por tu URL real):

```
https://elotemania-api.onrender.com/api/health
```

Debe responder: `{"ok":true,"message":"API del restaurante funcionando","database":"neondb",...}`

Si falla, revisa **Logs** en Render (ver "Problemas frecuentes" abajo).
**Copia la URL de tu backend**; la necesitas en el siguiente paso.

---

## Paso 5 — Frontend en Vercel

1. Vercel → **Add New… → Project** → importa el repositorio de GitHub.
2. Configura:

| Campo | Valor |
|---|---|
| **Root Directory** | `frontend` (pulsa *Edit* y selecciónala) |
| Framework Preset | Vite (se detecta solo) |
| Build Command | `npm run build` |
| Output Directory | `dist` |

3. En **Environment Variables** agrega:

| Nombre | Valor |
|---|---|
| `VITE_API_URL` | `https://elotemania-api.onrender.com/api` |

   - Debe terminar en **`/api`** y **sin** `/` final.
   - Las variables `VITE_*` se incrustan al **compilar**: si luego la cambias, haz **Redeploy**.
4. **Deploy**. Al terminar, Vercel te da una URL como `https://elotemania.vercel.app`. Cópiala.

---

## Paso 6 — Cerrar el círculo (CORS)

El backend solo acepta peticiones del origen que esté en `FRONTEND_URL`.

1. Render → tu servicio → **Environment** → edita `FRONTEND_URL`:

   ```
   https://elotemania.vercel.app
   ```

   - Exacta, con `https://`, **sin `/` al final**.
   - Varias URLs (por ejemplo un dominio propio) separadas por coma:
     `https://elotemania.vercel.app,https://www.mirestaurante.com`
2. Guarda: Render reinicia el servicio solo.

> Las URLs de *preview* de Vercel (ramas/PR) cambian en cada despliegue y **no** estarán permitidas. Usa la URL de producción.

---

## Paso 7 — Lista de pruebas final

1. Abre la URL de Vercel → se ve el menú.
2. Recarga en `/login` → carga bien (no 404).
3. Inicia sesión como administrador.
4. Crea una categoría y un producto **con foto** → la imagen debe verse y su URL debe empezar por
   `https://res.cloudinary.com/...`.
5. Crea un pedido desde caja, cóbralo y genera el comprobante.
6. En Render, redespliega manualmente (**Manual Deploy**) y confirma que la foto **sigue ahí**.

---

## Límites de los planes gratuitos (verifica las condiciones vigentes en cada sitio)

- **Render Free:** el servicio se **duerme tras ~15 min sin tráfico**; la primera petición después tarda
  unos 30–60 s. Para un punto de venta real, un plan de pago evita esto. Alternativa: un monitor externo
  (p. ej. UptimeRobot) que visite `/api/health` cada 5–10 min.
- **Neon Free:** el cómputo se suspende tras unos minutos sin uso y se reactiva en ~1 s (el backend
  ya espera hasta 15 s). Tiene límite de almacenamiento: suficiente para empezar.
- **Copias de seguridad:** no dependas solo del plan gratuito. Programa un `pg_dump` periódico:

  ```bash
  pg_dump -Fc --no-owner --no-privileges -d "TU_CADENA_NEON" -f respaldo-$(date +%F).backup
  ```

---

## Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| Render: `Falta configurar DATABASE_URL` | La variable no está definida o está vacía en *Environment*. |
| Render: `password authentication failed` / `SSL` | Cadena mal copiada. Usa la **directa** de Neon con `?sslmode=require`, sin `channel_binding`. |
| Render: `connection timeout` | Neon estaba suspendido; reintenta. Si persiste, revisa que el proyecto no esté pausado. |
| Navegador: "Origen no autorizado" / error CORS (403) | `FRONTEND_URL` no coincide exactamente con la URL de Vercel (revisa `https`, `/` final y mayúsculas). |
| Login: "Error de conexión con el servidor" | `VITE_API_URL` mal puesta o sin `/api`; corrígela y **redespliega** en Vercel. |
| Login: "Usuario o contraseña incorrectos" | En Opción B no hay usuarios: ejecuta el Paso 1.4. En Opción A usa las credenciales de tu base local. |
| 404 al recargar una página en Vercel | Falta `frontend/vercel.json` o Root Directory no es `frontend`. |
| Foto de producto no carga (404) | Es una ruta antigua `/uploads/...`: vuelve a subirla (Paso 1.5). Si al subir da error 502, revisa las 3 variables `CLOUDINARY_*`. |
| Vercel: build falla por versión de Node | Settings → General → **Node.js Version: 22.x** y redespliega. |
| `pg_restore: error: ... already exists` | Restauraste dos veces la misma base (ver aviso en 1.3). |
| `pg_dump: error: aborting because of server version mismatch` | Tu `pg_dump` local es más nuevo que el Postgres de Neon: crea el proyecto Neon con una versión igual o mayor. |

---

## Flujo para futuras actualizaciones

```bash
git add .
git commit -m "describe el cambio"
git push
```

Render y Vercel redespliegan solos. Si cambias la **estructura de la base de datos**, aplícala también en Neon
(SQL Editor o `psql`) **antes** de subir el código que la usa.
