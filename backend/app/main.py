import json
import os
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from supabase import Client, create_client

ROOT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT_DIR / "backend" / "data"
DATA_FILE = DATA_DIR / "store.json"

load_dotenv(ROOT_DIR / ".env")

app = FastAPI(title="SmartStock Ferretería API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR.mkdir(parents=True, exist_ok=True)

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "").strip()
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
AI_PROVIDER = os.getenv("AI_PROVIDER", "demo")


class ProductPayload(BaseModel):
    name: str = Field(min_length=2)
    description: str = Field(default="")
    category: str = Field(min_length=2)
    price: float = Field(gt=0)
    quantity: int = Field(ge=0)
    min_stock: int = Field(ge=0)
    image_url: str | None = None


class ProductUpdate(ProductPayload):
    pass


class SaleItemPayload(BaseModel):
    product_id: str
    quantity: int = Field(gt=0)


class SalePayload(BaseModel):
    items: list[SaleItemPayload]
    notes: str | None = None


class LoginPayload(BaseModel):
    email: str
    password: str


class ChatPayload(BaseModel):
    message: str = Field(min_length=1)


AUTH_USERS: dict[str, dict[str, str]] = {}
SESSION_LOCK = Lock()


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def is_supabase_configured() -> bool:
    return bool(SUPABASE_URL and SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY)


def get_service_supabase() -> Client | None:
    if not is_supabase_configured():
        return None
    return create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def default_products() -> list[dict[str, Any]]:
    return [
        {
            "id": "prd-1",
            "name": "Taladro Percutor 650W",
            "description": "Taladro de uso general para trabajos de bricolaje y construcción.",
            "category": "Herramientas eléctricas",
            "price": 249.99,
            "quantity": 12,
            "min_stock": 4,
            "image_url": "",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        },
        {
            "id": "prd-2",
            "name": "Sierra Circular 180mm",
            "description": "Sierra para cortes precisos y rápidos en madera y paneles.",
            "category": "Herramientas eléctricas",
            "price": 319.0,
            "quantity": 5,
            "min_stock": 3,
            "image_url": "",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        },
        {
            "id": "prd-3",
            "name": "Llave inglesa 12\"",
            "description": "Llave robusta para ajustes de tornillos y tuercas.",
            "category": "Herramientas manuales",
            "price": 49.5,
            "quantity": 18,
            "min_stock": 6,
            "image_url": "",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        },
    ]


def default_sales() -> list[dict[str, Any]]:
    return [
        {
            "id": "sale-1",
            "seller": "Luis Vendedor",
            "seller_role": "seller",
            "date": now_iso(),
            "items": [{"product_id": "prd-3", "product_name": "Llave inglesa 12\"", "quantity": 2, "unit_price": 49.5}],
            "total": 99.0,
        }
    ]


def init_demo_data() -> dict[str, Any]:
    state = {"products": default_products(), "sales": default_sales()}
    save_state(state)
    return state


def load_state() -> dict[str, Any]:
    if not DATA_FILE.exists():
        return init_demo_data()
    try:
        with DATA_FILE.open("r", encoding="utf-8") as fh:
            data = json.load(fh)
        if not data.get("products"):
            return init_demo_data()
        return data
    except json.JSONDecodeError:
        return init_demo_data()


def save_state(state: dict[str, Any]) -> None:
    with DATA_FILE.open("w", encoding="utf-8") as fh:
        json.dump(state, fh, ensure_ascii=False, indent=2)


APP_STATE = load_state()


async def resolve_profile_from_supabase(service: Client, user_id: str, email: str) -> dict[str, str]:
    existing = service.table("profiles").select("*").eq("id", user_id).maybe_single().execute()
    profile = existing.data
    if profile:
        return {
            "id": str(profile.get("id")),
            "email": profile.get("email") or email,
            "name": profile.get("full_name") or email,
            "role": profile.get("role") or "seller",
        }

    default_role = "admin" if "admin" in email.lower() else "seller"
    profile_payload = {
        "id": user_id,
        "email": email,
        "full_name": email.split("@", 1)[0],
        "role": default_role,
    }
    service.table("profiles").insert(profile_payload).execute()
    return {
        "id": user_id,
        "email": email,
        "name": profile_payload["full_name"],
        "role": default_role,
    }


async def get_current_user(authorization: str | None = Header(default=None)) -> dict[str, str]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No autorizado")
    token = authorization.split(" ", 1)[1]

    if is_supabase_configured():
        try:
            service = get_service_supabase()
            auth_response = service.auth.get_user(token)
            auth_user = getattr(auth_response, "user", None) or auth_response.get("user")
            if not auth_user:
                raise HTTPException(status_code=401, detail="Sesión inválida")
            profile = await resolve_profile_from_supabase(service, str(auth_user.id), auth_user.email or "")
            return profile
        except Exception as exc:  # pragma: no cover - depends on Supabase runtime
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesión inválida o expirada") from exc

    user = AUTH_USERS.get(token)
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sesión inválida")
    return user


def require_role(*allowed_roles: str):
    def dependency(user: dict[str, str] = Depends(get_current_user)) -> dict[str, str]:
        if user.get("role") not in allowed_roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No tienes permisos para esta acción")
        return user

    return dependency


def find_product_by_id(product_id: str) -> dict[str, Any] | None:
    return next((product for product in APP_STATE["products"] if product["id"] == product_id), None)


def product_exists_by_name(name: str, category: str, exclude_id: str | None = None) -> bool:
    target_name = name.strip().lower()
    target_category = category.strip().lower()
    for product in APP_STATE["products"]:
        if product["id"] == exclude_id:
            continue
        if product["name"].strip().lower() == target_name and product["category"].strip().lower() == target_category:
            return True
    return False


def calculate_dashboard() -> dict[str, Any]:
    products = APP_STATE["products"]
    sales = APP_STATE["sales"]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    sales_today = sum(1 for sale in sales if sale.get("date", "").startswith(today))
    low_stock = sum(1 for product in products if product["quantity"] <= product.get("min_stock", 0))
    total_revenue = round(sum(float(sale.get("total", 0)) for sale in sales), 2)
    return {
        "products_count": len(products),
        "sales_today": sales_today,
        "low_stock_count": low_stock,
        "total_revenue": total_revenue,
        "recent_sales": sales[-5:][::-1],
    }


async def load_products_from_cloud() -> list[dict[str, Any]]:
    if not is_supabase_configured():
        raise HTTPException(status_code=503, detail="Supabase no está configurado. Configure las variables de entorno.")
    service = get_service_supabase()
    result = service.table("products").select("*").order("created_at", desc=False).execute()
    return result.data or []


async def load_sales_from_cloud() -> list[dict[str, Any]]:
    if not is_supabase_configured():
        raise HTTPException(status_code=503, detail="Supabase no está configurado. Configure las variables de entorno.")
    service = get_service_supabase()
    result = service.table("sales").select("*, sale_details(*, products(name))").order("created_at", desc=False).execute()
    return result.data or []


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY),
        "ai_configured": bool(OPENAI_API_KEY),
        "mode": "cloud" if is_supabase_configured() else "local-demo",
    }


@app.get("/api/system")
def system_status() -> dict[str, Any]:
    configured = is_supabase_configured()
    if not configured:
        return {
            "supabase_configured": False,
            "ai_configured": bool(OPENAI_API_KEY),
            "service_role_configured": bool(SUPABASE_SERVICE_ROLE_KEY),
            "message": "Supabase no configurado. La aplicación sigue operando en modo demo local, pero no se guardan datos reales en la nube.",
        }
    return {
        "supabase_configured": True,
        "ai_configured": bool(OPENAI_API_KEY),
        "service_role_configured": bool(SUPABASE_SERVICE_ROLE_KEY),
        "message": "Supabase y FastAPI configurados correctamente.",
    }


@app.post("/api/auth/login")
async def login(payload: LoginPayload):
    email = payload.email.strip().lower()
    password = payload.password.strip()
    if not email or not password:
        raise HTTPException(status_code=400, detail="Correo y contraseña obligatorios")

    if is_supabase_configured():
        auth_client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
        result = auth_client.auth.sign_in_with_password({"email": email, "password": password})
        if result.error:
            raise HTTPException(status_code=401, detail=result.error.message)
        session = result.session
        user = result.user
        profile = await resolve_profile_from_supabase(get_service_supabase(), str(user.id), user.email or email)
        return {
            "token": session.access_token,
            "user": profile,
            "message": "Inicio de sesión exitoso",
        }

    role = "admin" if "admin" in email else "seller"
    username = "Ana Admin" if role == "admin" else "Luis Vendedor"
    token = f"token-{len(AUTH_USERS) + 1}-{role}"
    user = {"id": token, "email": email, "name": username, "role": role}
    AUTH_USERS[token] = user
    return {"token": token, "user": user, "message": "Inicio de sesión exitoso"}


@app.get("/api/me")
def me(user: dict[str, str] = Depends(get_current_user)):
    return user


@app.get("/api/dashboard")
async def dashboard() -> dict[str, Any]:
    if is_supabase_configured():
        products = await load_products_from_cloud()
        sales = await load_sales_from_cloud()
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        sales_today = sum(1 for sale in sales if (sale.get("created_at") or "").startswith(today))
        low_stock = sum(1 for product in products if int(product.get("quantity", 0)) <= int(product.get("min_stock", 0)))
        total_revenue = round(sum(float(item.get("total", 0)) for item in sales), 2)
        return {
            "products_count": len(products),
            "sales_today": sales_today,
            "low_stock_count": low_stock,
            "total_revenue": total_revenue,
            "recent_sales": sales[-5:][::-1],
        }
    return calculate_dashboard()


@app.get("/api/products")
async def list_products(
    category: str | None = None,
    search: str | None = None,
    _: dict[str, str] = Depends(get_current_user),
):
    if is_supabase_configured():
        products = await load_products_from_cloud()
        if category:
            products = [product for product in products if str(product.get("category", "")).lower() == category.lower()]
        if search:
            search_value = search.lower()
            products = [
                product
                for product in products
                if search_value in str(product.get("name", "")).lower()
                or search_value in str(product.get("category", "")).lower()
                or search_value in str(product.get("description", "")).lower()
            ]
        return products

    products = APP_STATE["products"]
    if category:
        products = [product for product in products if product["category"].lower() == category.lower()]
    if search:
        search_value = search.lower()
        products = [
            product
            for product in products
            if search_value in product["name"].lower() or search_value in product["category"].lower() or search_value in product["description"].lower()
        ]
    return products


@app.get("/api/products/{product_id}")
async def get_product(product_id: str, _: dict[str, str] = Depends(get_current_user)):
    if is_supabase_configured():
        service = get_service_supabase()
        result = service.table("products").select("*").eq("id", product_id).maybe_single().execute()
        product = result.data
        if not product:
            raise HTTPException(status_code=404, detail="Producto no encontrado")
        return product

    product = find_product_by_id(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return product


@app.post("/api/products")
async def create_product(payload: ProductPayload, user: dict[str, str] = Depends(require_role("admin"))):
    if is_supabase_configured():
        service = get_service_supabase()
        duplicate = service.table("products").select("id").eq("name", payload.name.strip()).eq("category", payload.category.strip()).execute()
        if duplicate.data:
            raise HTTPException(status_code=409, detail="Ya existe un producto con ese nombre y categoría")
        product_id = str(uuid4())
        product_payload = {
            "id": product_id,
            "name": payload.name.strip(),
            "description": payload.description.strip(),
            "category": payload.category.strip(),
            "price": float(payload.price),
            "quantity": int(payload.quantity),
            "min_stock": int(payload.min_stock),
            "image_url": payload.image_url or "",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        result = service.table("products").insert(product_payload).execute()
        return {"message": "Producto registrado", "product": result.data[0], "created_by": user["email"]}

    if product_exists_by_name(payload.name, payload.category):
        raise HTTPException(status_code=409, detail="Ya existe un producto con ese nombre y categoría")
    product_id = f"prd-{uuid4().hex[:8]}"
    product = {
        "id": product_id,
        "name": payload.name.strip(),
        "description": payload.description.strip(),
        "category": payload.category.strip(),
        "price": round(float(payload.price), 2),
        "quantity": int(payload.quantity),
        "min_stock": int(payload.min_stock),
        "image_url": payload.image_url or "",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    APP_STATE["products"].append(product)
    save_state(APP_STATE)
    return {"message": "Producto registrado", "product": product, "created_by": user["email"]}


@app.put("/api/products/{product_id}")
async def update_product(product_id: str, payload: ProductUpdate, user: dict[str, str] = Depends(require_role("admin"))):
    if is_supabase_configured():
        service = get_service_supabase()
        existing = service.table("products").select("id").eq("name", payload.name.strip()).eq("category", payload.category.strip()).execute()
        if existing.data and all(item["id"] != product_id for item in existing.data):
            raise HTTPException(status_code=409, detail="Ya existe un producto con ese nombre y categoría")
        update_payload = {
            "name": payload.name.strip(),
            "description": payload.description.strip(),
            "category": payload.category.strip(),
            "price": float(payload.price),
            "quantity": int(payload.quantity),
            "min_stock": int(payload.min_stock),
            "image_url": payload.image_url or "",
            "updated_at": now_iso(),
        }
        result = service.table("products").update(update_payload).eq("id", product_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Producto no encontrado")
        return {"message": "Producto actualizado", "product": result.data[0], "updated_by": user["email"]}

    product = find_product_by_id(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    if product_exists_by_name(payload.name, payload.category, exclude_id=product_id):
        raise HTTPException(status_code=409, detail="Ya existe un producto con ese nombre y categoría")
    product.update({
        "name": payload.name.strip(),
        "description": payload.description.strip(),
        "category": payload.category.strip(),
        "price": round(float(payload.price), 2),
        "quantity": int(payload.quantity),
        "min_stock": int(payload.min_stock),
        "image_url": payload.image_url or "",
        "updated_at": now_iso(),
    })
    save_state(APP_STATE)
    return {"message": "Producto actualizado", "product": product, "updated_by": user["email"]}


@app.delete("/api/products/{product_id}")
async def delete_product(product_id: str, user: dict[str, str] = Depends(require_role("admin"))):
    if is_supabase_configured():
        service = get_service_supabase()
        result = service.table("products").delete().eq("id", product_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Producto no encontrado")
        return {"message": "Producto eliminado", "deleted_by": user["email"]}

    product = find_product_by_id(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    APP_STATE["products"] = [item for item in APP_STATE["products"] if item["id"] != product_id]
    save_state(APP_STATE)
    return {"message": "Producto eliminado", "deleted_by": user["email"]}


@app.patch("/api/products/{product_id}/stock")
async def adjust_stock(product_id: str, payload: dict[str, int], user: dict[str, str] = Depends(require_role("admin"))):
    qty = int(payload.get("quantity", 0))
    if qty < 0:
        raise HTTPException(status_code=400, detail="La cantidad no puede ser negativa")

    if is_supabase_configured():
        service = get_service_supabase()
        result = service.table("products").update({"quantity": qty, "updated_at": now_iso()}).eq("id", product_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Producto no encontrado")
        return {"message": "Inventario actualizado", "product": result.data[0], "updated_by": user["email"]}

    product = find_product_by_id(product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    product["quantity"] = qty
    product["updated_at"] = now_iso()
    save_state(APP_STATE)
    return {"message": "Inventario actualizado", "product": product, "updated_by": user["email"]}


@app.post("/api/products/{product_id}/image")
async def upload_product_image(product_id: str, file: UploadFile = File(...), user: dict[str, str] = Depends(require_role("admin"))):
    if not is_supabase_configured():
        raise HTTPException(status_code=503, detail="Supabase no está configurado. No se puede subir la imagen sin credenciales.")
    service = get_service_supabase()
    content = await file.read()
    extension = Path(file.filename or "product.png").suffix or ".png"
    storage_path = f"products/{product_id}{extension}"
    upload_result = service.storage.from_("product-images").upload(storage_path, content, file_options={"content-type": file.content_type or "image/png"})
    if getattr(upload_result, "error", None):
        raise HTTPException(status_code=400, detail=getattr(upload_result.error, "message", "No se pudo subir la imagen."))
    url = service.storage.from_("product-images").get_public_url(storage_path)
    update_result = service.table("products").update({"image_url": url, "updated_at": now_iso()}).eq("id", product_id).execute()
    if not update_result.data:
        raise HTTPException(status_code=404, detail="Producto no encontrado")
    return {"message": "Imagen subida", "image_url": url, "product": update_result.data[0], "uploaded_by": user["email"]}


@app.get("/api/inventory")
async def inventory(_: dict[str, str] = Depends(get_current_user)):
    if is_supabase_configured():
        products = await load_products_from_cloud()
        low_stock = [product for product in products if int(product.get("quantity", 0)) <= int(product.get("min_stock", 0))]
        return {
            "total_products": len(products),
            "low_stock": low_stock,
            "out_of_stock": [product for product in products if int(product.get("quantity", 0)) == 0],
        }
    products = APP_STATE["products"]
    low_stock = [product for product in products if product["quantity"] <= product.get("min_stock", 0)]
    return {"total_products": len(products), "low_stock": low_stock, "out_of_stock": [product for product in products if product["quantity"] == 0]}


@app.get("/api/sales")
async def list_sales(date: str | None = None, _: dict[str, str] = Depends(get_current_user)):
    if is_supabase_configured():
        sales = await load_sales_from_cloud()
        if date:
            sales = [sale for sale in sales if (sale.get("created_at") or "").startswith(date)]
        return sales

    sales = APP_STATE["sales"]
    if date:
        sales = [sale for sale in sales if sale.get("date", "").startswith(date)]
    return sales


@app.post("/api/sales")
async def create_sale(payload: SalePayload, user: dict[str, str] = Depends(require_role("admin", "seller"))):
    if not payload.items:
        raise HTTPException(status_code=400, detail="Debes incluir al menos un producto")

    if is_supabase_configured():
        service = get_service_supabase()
        sale_items = [{"product_id": item.product_id, "quantity": int(item.quantity)} for item in payload.items]
        result = service.rpc(
            "register_sale",
            {"p_seller_id": user["id"], "p_items": sale_items},
        ).execute()
        if result.data is None:
            raise HTTPException(status_code=400, detail="No se pudo registrar la venta en la base de datos.")
        return {"message": "Venta registrada correctamente", "sale": result.data}

    with SESSION_LOCK:
        sale_id = f"sale-{uuid4().hex[:8]}"
        sale_lines = []
        total = 0.0
        for entry in payload.items:
            product = find_product_by_id(entry.product_id)
            if not product:
                raise HTTPException(status_code=404, detail=f"Producto no encontrado: {entry.product_id}")
            if entry.quantity > product["quantity"]:
                raise HTTPException(status_code=400, detail=f"Stock insuficiente para {product['name']}")
            item_total = float(product["price"]) * int(entry.quantity)
            total += item_total
            sale_lines.append({
                "product_id": product["id"],
                "product_name": product["name"],
                "quantity": entry.quantity,
                "unit_price": float(product["price"]),
                "total": round(item_total, 2),
            })
        sale = {
            "id": sale_id,
            "seller": user["name"],
            "seller_role": user["role"],
            "date": now_iso(),
            "items": sale_lines,
            "total": round(total, 2),
            "notes": payload.notes,
        }
        for entry in payload.items:
            product = find_product_by_id(entry.product_id)
            product["quantity"] = int(product["quantity"]) - int(entry.quantity)
            product["updated_at"] = now_iso()
        APP_STATE["sales"].append(sale)
        save_state(APP_STATE)
        return {"message": "Venta registrada correctamente", "sale": sale}


@app.get("/api/sales/{sale_id}")
async def get_sale(sale_id: str, _: dict[str, str] = Depends(get_current_user)):
    if is_supabase_configured():
        service = get_service_supabase()
        result = service.table("sales").select("*, sale_details(*, products(name))").eq("id", sale_id).maybe_single().execute()
        sale = result.data
        if not sale:
            raise HTTPException(status_code=404, detail="Venta no encontrada")
        return sale

    sale = next((item for item in APP_STATE["sales"] if item["id"] == sale_id), None)
    if not sale:
        raise HTTPException(status_code=404, detail="Venta no encontrada")
    return sale


@app.post("/api/assistant/chat")
async def assistant_chat(payload: ChatPayload, _: dict[str, str] = Depends(get_current_user)):
    products = APP_STATE["products"]
    if is_supabase_configured():
        products = await load_products_from_cloud()
    text = payload.message.lower().strip()

    if not OPENAI_API_KEY:
        answer = "El asistente de IA no está configurado todavía. Aun así, puedo ayudarte con la información disponible del catálogo."
        if "bajo" in text or "stock" in text or "inventario" in text:
            low_stock = [product for product in products if int(product.get("quantity", 0)) <= int(product.get("min_stock", 0))]
            if low_stock:
                answer += " Los productos con stock bajo son: " + ", ".join(product["name"] for product in low_stock[:3]) + "."
            else:
                answer += " Actualmente no hay productos bajo el nivel mínimo de inventario."
        elif "alternativo" in text or "sustituto" in text or "reemplazo" in text:
            answer += " Revisa la categoría de productos similares y considera alternativas de la misma familia, por ejemplo: " + ", ".join(product["name"] for product in products[:3]) + "."
        elif "complementario" in text or "complemento" in text or "accesorio" in text:
            answer += " Para complementar la compra, te sugiero revisar productos de la misma categoría y herramientas asociadas a las ventas más recientes."
        else:
            cats = ", ".join(sorted({product["category"] for product in products}))
            answer += f" El catálogo disponible incluye estas categorías: {cats}."
        return {"answer": answer, "source": "demo"}

    if "producto" in text or "catalog" in text or "inventario" in text:
        sample = ", ".join(product["name"] for product in products[:3])
        answer = f"Consulté el catálogo: {sample}. Puedo sugerir productos compatibles según el contexto solicitado."
    else:
        answer = "Puedo recomendar productos, alternativas y complementos tomando como base el catálogo disponible."
    return {"answer": answer, "source": "api"}


@app.get("/api/seed")
def seed_demo_data() -> dict[str, Any]:
    APP_STATE.update(load_state())
    return {"message": "Datos cargados", "products": APP_STATE["products"]}
