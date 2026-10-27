import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient
from supabase import create_client
from supabase_auth.errors import AuthApiError, AuthRetryableError

from backend.app import main


class SupabaseApiTests(unittest.TestCase):
    def setUp(self):
        self.original_config = (
            main.SUPABASE_URL,
            main.SUPABASE_PUBLISHABLE_KEY,
            main.SUPABASE_SECRET_KEY,
        )
        main.SUPABASE_URL = ""
        main.SUPABASE_PUBLISHABLE_KEY = ""
        main.SUPABASE_SECRET_KEY = ""
        self.client = TestClient(main.app)

    def tearDown(self):
        main.SUPABASE_URL, main.SUPABASE_PUBLISHABLE_KEY, main.SUPABASE_SECRET_KEY = self.original_config
        main.app.dependency_overrides.clear()

    def configure_cloud(self):
        main.SUPABASE_URL = "https://project.invalid"
        main.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test"
        main.SUPABASE_SECRET_KEY = "sb_secret_test"

    def test_partial_supabase_configuration_never_uses_demo_storage(self):
        main.SUPABASE_URL = "https://project.invalid"
        response = self.client.get("/api/products", headers={"Authorization": "Bearer demo-token"})
        self.assertEqual(response.status_code, 503)
        self.assertIn("No se usarán datos locales", response.json()["detail"])

    def test_demo_login_never_grants_admin_from_email(self):
        response = self.client.post(
            "/api/auth/login",
            json={"email": "admin@example.test", "password": "any-password"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["role"], "seller")

    def test_dashboard_requires_authentication(self):
        response = self.client.get("/api/dashboard")
        self.assertEqual(response.status_code, 401)

    def test_assistant_is_reported_as_demo_and_not_configured_ai(self):
        main.app.dependency_overrides[main.get_current_user] = lambda: {
            "id": "seller-id", "email": "seller@example.test", "name": "Seller", "role": "seller"
        }
        status_response = self.client.get("/api/health")
        chat_response = self.client.post("/api/assistant/chat", json={"message": "recomienda algo"})
        self.assertFalse(status_response.json()["ai_configured"])
        self.assertEqual(chat_response.status_code, 200)
        self.assertEqual(chat_response.json()["source"], "demo")

    def test_supabase_product_failure_is_not_replaced_with_demo_data(self):
        self.configure_cloud()
        main.app.dependency_overrides[main.get_current_user] = lambda: {
            "id": "seller-id", "email": "seller@example.test", "name": "Seller", "role": "seller"
        }
        with patch.object(main, "load_products_from_cloud", new=AsyncMock(side_effect=HTTPException(503, "cloud unavailable"))):
            response = self.client.get("/api/products")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "cloud unavailable")

    def test_seller_cannot_create_products_even_with_service_key_configured(self):
        self.configure_cloud()
        main.app.dependency_overrides[main.get_current_user] = lambda: {
            "id": "seller-id", "email": "seller@example.test", "name": "Seller", "role": "seller"
        }
        with patch.object(main, "create_client") as create_client:
            response = self.client.post(
                "/api/products",
                json={
                    "name": "Martillo",
                    "description": "",
                    "category": "Herramientas",
                    "price": 15,
                    "quantity": 3,
                    "min_stock": 1,
                },
            )
        self.assertEqual(response.status_code, 403)
        create_client.assert_not_called()

    def test_sales_query_is_limited_to_seller_when_service_key_bypasses_rls(self):
        self.configure_cloud()
        sales_query = Mock()
        sales_query.eq.return_value = sales_query
        sales_query.execute.return_value.data = [{"id": "sale-id", "seller_id": "seller-id"}]
        service = Mock()
        service.table.return_value.select.return_value.order.return_value = sales_query
        with patch.object(main, "get_service_supabase", return_value=service):
            sales = asyncio.run(main.load_sales_from_cloud("seller-id"))
        self.assertEqual(sales[0]["seller_id"], "seller-id")
        sales_query.eq.assert_called_once_with("seller_id", "seller-id")

    def test_sales_rpc_uses_authenticated_seller_id(self):
        self.configure_cloud()
        seller = {"id": "seller-id", "email": "seller@example.test", "name": "Seller", "role": "seller"}
        main.app.dependency_overrides[main.get_current_user] = lambda: seller
        service = Mock()
        service.rpc.return_value.execute.return_value.data = {"id": "sale-id", "seller_id": "seller-id"}
        with patch.object(main, "get_service_supabase", return_value=service):
            response = self.client.post(
                "/api/sales",
                json={"items": [{"product_id": "product-id", "quantity": 2}]},
            )
        self.assertEqual(response.status_code, 200)
        service.rpc.assert_called_once_with(
            "register_sale",
            {"p_seller_id": "seller-id", "p_items": [{"product_id": "product-id", "quantity": 2}]},
        )

    def test_admin_image_upload_uses_product_images_bucket(self):
        self.configure_cloud()
        main.app.dependency_overrides[main.get_current_user] = lambda: {
            "id": "admin-id", "email": "admin@example.test", "name": "Admin", "role": "admin"
        }
        service = Mock()
        bucket = service.storage.from_.return_value
        bucket.upload.return_value = SimpleNamespace(error=None)
        bucket.get_public_url.return_value = "https://project.invalid/storage/product.png"
        service.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
            {"id": "product-id", "image_url": "https://project.invalid/storage/product.png"}
        ]
        with patch.object(main, "get_service_supabase", return_value=service):
            response = self.client.post(
                "/api/products/product-id/image",
                files={"file": ("product.png", b"image-bytes", "image/png")},
            )
        self.assertEqual(response.status_code, 200)
        service.storage.from_.assert_called_with("product-images")
        bucket.upload.assert_called_once()


class SupabaseAuthTests(unittest.TestCase):
    def setUp(self):
        self.original_config = (
            main.SUPABASE_URL,
            main.SUPABASE_PUBLISHABLE_KEY,
            main.SUPABASE_SECRET_KEY,
        )
        main.SUPABASE_URL = "https://project.invalid"
        main.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test"
        main.SUPABASE_SECRET_KEY = "sb_secret_test"

    def tearDown(self):
        main.SUPABASE_URL, main.SUPABASE_PUBLISHABLE_KEY, main.SUPABASE_SECRET_KEY = self.original_config

    def test_installed_sdk_accepts_current_supabase_key_formats(self):
        public_client = create_client("https://project.invalid", "sb_publishable_test")
        secret_client = create_client("https://project.invalid", "sb_secret_test")
        self.assertIsNotNone(public_client.auth)
        self.assertIsNotNone(secret_client.storage)

    def test_access_token_is_verified_by_auth_and_role_comes_from_profile(self):
        auth_client = Mock()
        auth_client.auth.get_user.return_value.user = SimpleNamespace(
            id="user-id",
            email="admin@example.test",
        )
        service = Mock()
        service.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
            "id": "user-id",
            "email": "admin@example.test",
            "full_name": "Seller",
            "role": "seller",
        }
        with patch.object(main, "create_client", side_effect=[auth_client, service]) as create_client:
            user = asyncio.run(main.get_current_user("Bearer verified-access-token"))

        self.assertEqual(user["role"], "seller")
        auth_client.auth.get_user.assert_called_once_with("verified-access-token")
        self.assertEqual(create_client.call_args_list[0].args[1], "sb_publishable_test")
        self.assertEqual(create_client.call_args_list[1].args[1], "sb_secret_test")

    def test_new_admin_named_account_is_created_as_seller(self):
        service = Mock()
        service.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = None
        profile = asyncio.run(
            main.resolve_profile_from_supabase(service, "new-user-id", "admin@example.test")
        )
        payload = service.table.return_value.insert.call_args.args[0]
        self.assertEqual(payload["role"], "seller")
        self.assertEqual(profile["role"], "seller")

    def test_invalid_token_is_unauthorized_but_auth_outage_is_unavailable(self):
        auth_client = Mock()
        auth_client.auth.get_user.side_effect = AuthApiError("invalid token", 401, None)
        with patch.object(main, "create_client", return_value=auth_client):
            with self.assertRaises(HTTPException) as invalid:
                asyncio.run(main.get_current_user("Bearer invalid-token"))
        self.assertEqual(invalid.exception.status_code, 401)

        auth_client.auth.get_user.side_effect = AuthRetryableError("temporary outage", 503)
        with patch.object(main, "create_client", return_value=auth_client):
            with self.assertRaises(HTTPException) as unavailable:
                asyncio.run(main.get_current_user("Bearer valid-looking-token"))
        self.assertEqual(unavailable.exception.status_code, 503)

    def test_seller_role_dependency_rejects_admin_only_action(self):
        with self.assertRaises(HTTPException) as raised:
            main.require_role("admin")({"role": "seller"})
        self.assertEqual(raised.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
