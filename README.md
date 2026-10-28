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
- `supabase/migrations/`: SQL para PostgreSQL/Supabase
- `.env.example`: variables de entorno de ejemplo

## Ejecutar en local

1. Crear entorno virtual e instalar dependencias del backend:

```bash
python -m venv .venv
. .venv/Scripts/activate
pip install -r backend/requirements.txt
```

2. Instalar dependencias del frontend:

```bash
npm install --prefix frontend
npm install --save-dev concurrently
```

3. Iniciar el proyecto:

```bash
npm run dev
```

Esto levanta:

- Frontend en `http://localhost:5173`
- Backend en `http://localhost:8000`

El frontend de desarrollo usa por defecto el mismo host desde el que se abrió Vite para llamar al backend en el puerto `8000`. Así, al acceder desde otro dispositivo, las peticiones no apuntan al `localhost` de ese dispositivo. Para usar otro backend, configura `VITE_API_BASE_URL` en `frontend/.env` (por ejemplo, `http://192.168.1.20:8000`). En producción, configura esa variable con la URL del backend o sirve la API bajo el mismo origen mediante un proxy inverso.

El backend permite por defecto los orígenes locales `http://localhost:5173`, `http://127.0.0.1:5173` y `http://172.18.24.173:5173`. Para otros orígenes o producción, define `SMARTSTOCK_CORS_ORIGINS` en el `.env` del backend como una lista separada por comas de orígenes exactos, sin rutas ni comodines.

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

El backend valida cada access token mediante `auth.get_user()` del cliente Python, que consulta Supabase Auth. Por ese motivo no requiere `SUPABASE_JWKS_URL` ni valida tokens decodificando sus claims sin verificación. El rol se obtiene del registro `profiles` de la base de datos; las cuentas nuevas se crean como `seller`. Para otorgar rol de administrador, primero inicia sesión para crear el perfil y luego cambia su rol de forma explícita desde el SQL Editor de Supabase:

```sql
update public.profiles
set role = 'admin'
where email = 'correo-del-administrador';
```

Aplica en orden las migraciones `001_init.sql`, `002_secure_profile_roles.sql`, `003_fix_profile_admin_policy.sql` y `004_fix_register_sale_order.sql` desde el SQL Editor o mediante Supabase CLI. La primera crea las tablas, políticas, función de registro de ventas y bucket requerido para las imágenes; la segunda restringe la creación de perfiles y cambios de rol; la tercera elimina la recursión RLS, limita la lectura de perfiles a la persona titular o administradores, y asegura que el bucket sea público, tal como requiere `get_public_url()`; la cuarta corrige el orden de inserción de ventas/detalles y actualiza la función en proyectos que ya aplicaron la migración inicial. Aplica la cuarta migración también en proyectos existentes.

Las imágenes se almacenan en `Storage > Buckets > product-images` y son públicas para lectura; la carga y modificación se limitan a administradores. Comprueba en el panel que el bucket exista y figure como público.

El archivo `.env.example` es una plantilla, no se carga automáticamente. La integración usa `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY`; no usa las antiguas `SUPABASE_ANON_KEY` ni `SUPABASE_SERVICE_ROLE_KEY`.

## Acceso en modo demo local

- Entra como administrador con `admin@smartstock.test` y deja la contraseña vacía. Este acceso temporal solo funciona desde el mismo equipo y cuando Supabase no está configurado.
- Cualquier otro correo válido requiere una contraseña y entra como vendedor.

Para forzar temporalmente el modo demo local sin modificar las credenciales guardadas en `.env`, establece estas variables antes de ejecutar `npm run dev` en PowerShell:

```powershell
$env:SMARTSTOCK_LOCAL_DEMO = "true"
$env:VITE_LOCAL_DEMO = "true"
npm run dev
```

El modo demo ignora Supabase mientras esas variables estén activas en el proceso y usa `backend/data/store.json`; no modifica los datos en la nube. El acceso sin contraseña está deshabilitado con Supabase. Para uso real, configura Supabase y asigna explícitamente el rol desde SQL Editor. Si falta alguna variable de una configuración de Supabase empezada y no se fuerza el modo demo, el backend devuelve un error y no escribe en el almacenamiento demo.

## Modo demo e integración de IA

Sin ninguna variable de Supabase, el backend opera en modo demo local y conserva datos en `backend/data/store.json`. El asistente usa respuestas locales de demostración. No hay integración activa con OpenAI ni variables OpenAI leídas por el código; antes de añadir `OPENAI_API_KEY` se debe implementar una llamada real desde el backend y definir su modelo, manejo de errores y límites.

## Funcionalidades destacadas

- Login con roles
- Dashboard con métricas del almacenamiento configurado (Supabase o demo local)
- Catálogo de productos con CRUD
- Inventario y alertas de stock bajo
- Registro de ventas con actualización del inventario
- Historial de ventas
- Asistente de demostración con respuestas basadas en el catálogo; todavía no consume OpenAI

La configuración anterior describe la integración implementada en el código; no garantiza conectividad con un proyecto en la nube hasta completar la configuración y probarla con ese proyecto.
