# SmartStock Ferretería

Aplicación web full-stack para controlar inventario y ventas de una ferretería pequeña, con frontend en HTML/CSS/JavaScript y backend en FastAPI.

## Tecnologías

- Frontend: Vite + HTML + CSS + JavaScript
- Backend: Python + FastAPI
- Datos: almacenamiento local en modo demo con estructura lista para Supabase
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

## Credenciales de demo

- Administrador: cualquier correo con la palabra `admin`, por ejemplo `admin@smartstock.test`
- Vendedor: cualquier otro correo válido, por ejemplo `vendedor@smartstock.test`

La contraseña puede ser cualquier texto no vacío.

## Configuración pendiente

Si no se configuran las variables `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `OPENAI_API_KEY`, la aplicación sigue funcionando en modo local de demostración con mensajes claros de configuración pendiente.

## Funcionalidades destacadas

- Login con roles
- Dashboard con métricas reales de la base local
- Catálogo de productos con CRUD
- Inventario y alertas de stock bajo
- Registro de ventas con actualización del inventario
- Historial de ventas
- Asistente IA con respuesta basada en el catálogo y mensaje de configuración cuando no hay clave válida

## SQL de Supabase

En `supabase/migrations/001_init.sql` se incluyen las tablas, relaciones y políticas de seguridad para perfiles, productos, ventas, detalles de venta y ajustes de inventario.
