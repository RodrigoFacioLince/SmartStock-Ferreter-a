# SmartStock Ferretería

Aplicación web full-stack para controlar inventario y ventas de una ferretería pequeña, con frontend en HTML/CSS/JavaScript y backend en FastAPI.

## Tecnologías

- Frontend: Vite + HTML + CSS + JavaScript
- Backend: Python + FastAPI
- Datos: modo demo local o almacenamiento en Supabase
- Seguridad: sesión con token y permisos por rol (`admin` y `seller`)

## Estructura

- `frontend/`: aplicación web del cliente
- `backend/`: API REST en Python
- `backend/data/store.json`: datos persistidos del modo demo local
- `backend/tests/test_supabase_flows.py`: pruebas de autenticación, permisos e integración con servicios simulados
- `supabase/migrations/`: SQL para PostgreSQL/Supabase
- `.env.example`: variables de entorno de ejemplo

## Ejecutar en local

Requisitos: Python 3.10 o posterior con `venv` y `pip`, y Node.js 22 o posterior con npm. El archivo `frontend/package-lock.json` fija una versión del SDK de Supabase que requiere Node.js 22 o posterior.

Ejecuta los comandos desde la raíz del repositorio.

1. Crear y activar el entorno virtual según tu sistema:

**Linux/macOS (Bash):**

```bash
python3 -m venv .venv
source .venv/bin/activate
```

**Windows (PowerShell):**

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Con el entorno virtual activo, instalar las dependencias del backend, del lanzador de desarrollo y del frontend:

```bash
python -m pip install -r backend/requirements.txt
npm ci
npm ci --prefix frontend
```

3. Iniciar el proyecto desde esa misma terminal:

```bash
npm run dev
```

Esto levanta:

- Frontend en `http://localhost:5173`
- Backend en `http://localhost:8000`
- Documentación interactiva de la API en `http://localhost:8000/docs`

Sin credenciales de Supabase se puede usar directamente el [modo demo local](#acceso-en-modo-demo-local). Para trabajar con datos en la nube, completa la configuración siguiente antes de iniciar los servidores.

El frontend de desarrollo usa por defecto el mismo host desde el que se abrió Vite para llamar al backend en el puerto `8000`. Así, al acceder desde otro dispositivo, las peticiones no apuntan al `localhost` de ese dispositivo. Para usar otro backend, configura `VITE_API_BASE_URL` en `frontend/.env` (por ejemplo, `http://192.168.1.20:8000`). En producción, configura esa variable con la URL del backend o sirve la API bajo el mismo origen mediante un proxy inverso.

El backend permite por defecto los orígenes locales `http://localhost:5173`, `http://127.0.0.1:5173` y `http://172.18.24.173:5173`. Para otros orígenes o producción, define `SMARTSTOCK_CORS_ORIGINS` en el `.env` de la raíz como una lista separada por comas de orígenes exactos, sin rutas ni comodines. Esta lista reemplaza los valores predeterminados. Reinicia los servidores después de cambiar sus variables de entorno.

## Configuración de Supabase

El backend carga las variables desde `.env` en la raíz del repositorio. El frontend Vite carga las variables públicas desde `frontend/.env`. No copies `SUPABASE_SECRET_KEY` al frontend ni a ninguna variable con prefijo `VITE_`: Vite incorpora esas variables en el código enviado al navegador.

Configura las variables con los valores de un mismo proyecto:

**`.env` en la raíz (backend):**

```dotenv
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
```

`SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY` se obtienen en **Project Settings > API Keys**. La clave publicable se puede usar en el navegador; la clave secreta solo se usa en el backend y tiene privilegios elevados.

**`frontend/.env` (solo frontend):**

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Usa la misma URL y clave publicable que en el `.env` del backend. La URL está disponible en el diálogo **Connect** del proyecto de Supabase.

Aplica en orden las migraciones de `supabase/migrations/` desde el SQL Editor del proyecto:

| Migración | Cambios |
| --- | --- |
| `001_init.sql` | Crea las tablas, políticas de acceso, función de registro de ventas y bucket de imágenes. |
| `002_secure_profile_roles.sql` | Restringe la creación de perfiles y los cambios de rol. |
| `003_fix_profile_admin_policy.sql` | Elimina la recursión en las políticas de perfiles, limita su lectura a la persona titular o administradores y hace público el bucket de imágenes. |
| `004_fix_register_sale_order.sql` | Actualiza `register_sale` para validar productos y cantidades, comprobar el stock acumulado por producto y crear la venta antes de insertar sus detalles. |

En proyectos existentes, aplica las migraciones pendientes, incluida la cuarta; no vuelvas a ejecutar la inicial sobre un esquema ya creado. En Supabase, `register_sale` bloquea las filas de productos mientras comprueba existencias y registra la venta, sus detalles y el descuento de stock en una misma transacción.

La pantalla de acceso solo ofrece inicio de sesión. Crea previamente la cuenta en Supabase Auth, por ejemplo desde **Authentication > Users**, con correo y contraseña.

El backend valida cada access token mediante `auth.get_user()` del cliente Python, que consulta Supabase Auth. Por ese motivo no requiere `SUPABASE_JWKS_URL` ni valida tokens decodificando sus claims sin verificación. El rol se obtiene del registro `profiles` de la base de datos; los perfiles que se crean en el primer acceso reciben el rol `seller`. Para otorgar rol de administrador, primero inicia sesión para crear el perfil y luego cambia su rol de forma explícita desde el SQL Editor de Supabase:

```sql
update public.profiles
set role = 'admin'
where email = 'correo-del-administrador';
```

Vuelve a iniciar sesión para que la interfaz muestre el nuevo rol. Los administradores gestionan productos, imágenes y existencias, y consultan todas las ventas. Los vendedores consultan el catálogo y el inventario, registran ventas y ven únicamente sus propias ventas y métricas de ventas.

Las imágenes subidas se almacenan en `Storage > Buckets > product-images` y son públicas para lectura; la carga y modificación se limitan a administradores. Comprueba en el panel que el bucket exista y figure como público. También puedes guardar una URL de imagen externa, incluso en modo demo. La subida de archivos requiere Supabase configurado; la vista previa del archivo por sí sola no lo guarda. El formulario guarda primero el producto y después sube su imagen, por lo que un error en la subida no revierte el guardado del producto.

El archivo `.env.example` es una plantilla, no se carga automáticamente. La integración usa `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY`; no usa las antiguas `SUPABASE_ANON_KEY` ni `SUPABASE_SERVICE_ROLE_KEY`.

## Acceso en modo demo local

- Abre `http://localhost:5173`, entra como administrador con `admin@smartstock.test` y deja la contraseña vacía. Este acceso temporal requiere que la petición llegue al backend desde una dirección de loopback y que esté activo el modo demo local.
- Para entrar como vendedor, usa un correo y una contraseña no vacía. En modo demo no se valida esa contraseña contra una cuenta real; incluso `admin@smartstock.test` recibe el rol de vendedor si introduces una contraseña.
- Las sesiones demo se mantienen en memoria en el backend: después de reiniciarlo, vuelve a iniciar sesión. Los productos y ventas permanecen en `backend/data/store.json`.

Para forzar temporalmente el modo demo local sin modificar las credenciales guardadas en `.env`, activa ambas variables al iniciar el proyecto.

**Linux/macOS (Bash), solo para esa ejecución:**

```bash
SMARTSTOCK_LOCAL_DEMO=true VITE_LOCAL_DEMO=true npm run dev
```

**Windows (PowerShell):**

```powershell
$env:SMARTSTOCK_LOCAL_DEMO = "true"
$env:VITE_LOCAL_DEMO = "true"
npm run dev
```

En PowerShell, para volver a Supabase, detén los servidores y abre una nueva terminal con el entorno virtual activo, o elimina ambas variables con `Remove-Item Env:SMARTSTOCK_LOCAL_DEMO, Env:VITE_LOCAL_DEMO` antes de reiniciar.

El modo demo ignora Supabase mientras esas variables estén activas en el proceso y usa `backend/data/store.json`; no modifica los datos en la nube. El acceso sin contraseña está deshabilitado con Supabase. Para uso real, configura Supabase y asigna explícitamente el rol desde SQL Editor. Si falta alguna variable de una configuración de Supabase empezada y no se fuerza el modo demo, el backend devuelve un error y no escribe en el almacenamiento demo.

## Modo demo e integración de IA

Sin ninguna variable de Supabase, el backend opera en modo demo local y conserva datos en `backend/data/store.json`. El asistente usa respuestas locales de demostración. No hay integración activa con OpenAI ni variables OpenAI leídas por el código; antes de añadir `OPENAI_API_KEY` se debe implementar una llamada real desde el backend y definir su modelo, manejo de errores y límites.

## Funcionalidades destacadas

- Login con roles `admin` y `seller`.
- Dashboard con métricas del almacenamiento configurado y catálogo visual con búsqueda por nombre y filtro de categoría.
- Carrito temporal en Inicio con controles de cantidad, eliminación de productos, vaciado y transferencia a Ventas.
- Ficha de producto con imagen, descripción, categoría, precio, existencias y código o referencia, accesible desde el catálogo, inventario, carrito y resumen de venta.
- Gestión de productos con imágenes por URL o archivo, vista previa antes de guardar y marcadores cuando una imagen falta o no carga.
- Inventario con imágenes y estados de stock normal, bajo o agotado; el stock se considera bajo cuando es menor o igual al mínimo configurado.
- Resumen de venta con cantidades editables, eliminación de líneas y validación de existencias antes de confirmar.
- Historial de ventas con filtro por fecha y actualización de catálogo, inventario y métricas después de registrar una venta.
- Asistente de demostración con respuestas basadas en el catálogo; todavía no consume OpenAI.

Los importes se muestran actualmente en pesos colombianos (`COP`, formato `es-CO`).

## Flujo de registro de ventas

1. En **Inicio**, busca productos o filtra por categoría y agrégalos al **Carrito temporal**. Puedes aumentar o reducir cantidades, quitar productos o vaciarlo.
2. Pulsa **Continuar en Ventas**. La aplicación vuelve a consultar el catálogo y valida las existencias antes de combinar el carrito con los productos que ya hubiera en el resumen de venta. Si la suma supera el stock, muestra un aviso y conserva el carrito para corregirlo. Si la transferencia termina, vacía el carrito de Inicio.
3. En **Ventas**, también puedes agregar productos directamente y ajustar las cantidades con los controles `+` y `−`, o quitar líneas. Las cantidades deben ser enteros positivos y no superar las existencias disponibles.
4. Pulsa **Confirmar venta**. La aplicación consulta de nuevo productos y precios, valida las cantidades y deshabilita el botón mientras envía la operación. El backend registra la venta y descuenta el inventario.
5. Tras una respuesta exitosa, se limpia el resumen y se abre **Historial**. Se actualizan las ventas, los productos y las métricas. Si falla esta actualización posterior, el aviso indica que la venta sí quedó registrada.

El carrito y el resumen son temporales: no reservan ni descuentan stock hasta confirmar y se pierden al recargar la página. El campo **Notas** se guarda en modo demo; actualmente no se persiste en Supabase porque la función de registro solo recibe vendedor y productos.

## Pruebas y compilación

Con las dependencias instaladas y el entorno virtual activo, ejecuta desde la raíz:

```bash
python -m unittest discover -s backend/tests -v
npm run build
```

Las pruebas del backend cubren autenticación, roles, CORS, selección del modo de almacenamiento, registro de ventas y subida de imágenes mediante servicios simulados. No aplican las migraciones ni validan una conexión real a Supabase; tampoco incluyen pruebas automatizadas de la interfaz. Ejecútalas sin forzar `SMARTSTOCK_LOCAL_DEMO` y con los orígenes CORS predeterminados, ya que la suite comprueba tanto el modo demo como el modo Supabase y esos orígenes.

`npm run build` genera el frontend en `frontend/dist/`. Para previsualizarlo, ejecuta `npm run preview` y abre `http://localhost:4173`. La previsualización solo sirve el frontend: mantén el backend en ejecución. Como este build usa la configuración de producción, define `VITE_API_BASE_URL=http://localhost:8000` en `frontend/.env` antes de compilar para probar con el backend local, y añade `http://localhost:4173` a `SMARTSTOCK_CORS_ORIGINS` en el `.env` de la raíz. Sin `VITE_API_BASE_URL`, las peticiones del build se envían al mismo origen y requieren un proxy que dirija `/api` al backend.

La configuración anterior describe la integración implementada en el código; no garantiza conectividad con un proyecto en la nube hasta completar la configuración y probarla con ese proyecto.
