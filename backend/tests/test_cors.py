import os
import unittest
from unittest.mock import MagicMock, patch

from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from backend.app import main


class CorsTests(unittest.TestCase):
    def preflight(self, origins, origin):
        app = CORSMiddleware(
            app=main.fastapi_app,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=main.app.allow_methods,
            allow_headers=main.app.allow_headers,
        )
        return TestClient(app).options(
            "/api/sales",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "authorization,content-type",
            },
        )

    def test_empty_configuration_allows_localhost_and_detected_lan_origin(self):
        for configuration in (None, "", " , \t, "):
            with self.subTest(configuration=configuration):
                environment = {} if configuration is None else {"SMARTSTOCK_CORS_ORIGINS": configuration}
                with (
                    patch.dict(os.environ, environment, clear=True),
                    patch.object(main, "detect_lan_origin", return_value="http://192.168.1.20:5173"),
                ):
                    origins = main.get_cors_origins()
                self.assertEqual(origins, [
                    "http://localhost:5173",
                    "http://127.0.0.1:5173",
                    "http://192.168.1.20:5173",
                ])
                for origin in origins:
                    response = self.preflight(origins, origin)
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.headers["access-control-allow-origin"], origin)

    def test_explicit_configuration_replaces_defaults_and_skips_detection(self):
        with (
            patch.dict(os.environ, {"SMARTSTOCK_CORS_ORIGINS": " https://stock.example/ , http://192.168.1.30:4173, "}, clear=True),
            patch.object(main, "detect_lan_origin") as detect,
        ):
            origins = main.get_cors_origins()
        detect.assert_not_called()
        self.assertEqual(origins, ["https://stock.example", "http://192.168.1.30:4173"])
        for origin in origins:
            self.assertEqual(self.preflight(origins, origin).status_code, 200)
        for origin in ("http://localhost:5173", "http://192.168.1.20:5173"):
            response = self.preflight(origins, origin)
            self.assertEqual(response.status_code, 400)
            self.assertNotIn("access-control-allow-origin", response.headers)

    def test_default_configuration_rejects_other_hosts_schemes_and_ports(self):
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(main, "detect_lan_origin", return_value="http://192.168.1.20:5173"),
        ):
            origins = main.get_cors_origins()
        for origin in (
            "http://172.18.24.173:5173",
            "http://192.168.1.30:5173",
            "https://192.168.1.20:5173",
            "http://192.168.1.20:4173",
        ):
            with self.subTest(origin=origin):
                response = self.preflight(origins, origin)
                self.assertEqual(response.status_code, 400)
                self.assertNotIn("access-control-allow-origin", response.headers)

    def test_failed_detection_preserves_localhost_defaults(self):
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(main, "detect_lan_origin", return_value=None),
        ):
            origins = main.get_cors_origins()
        self.assertEqual(origins, ["http://localhost:5173", "http://127.0.0.1:5173"])
        for origin in origins:
            self.assertEqual(self.preflight(origins, origin).status_code, 200)

    def test_loopback_detection_does_not_duplicate_an_origin(self):
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(main, "detect_lan_origin", return_value="http://127.0.0.1:5173"),
        ):
            self.assertEqual(main.get_cors_origins(), ["http://localhost:5173", "http://127.0.0.1:5173"])

    def test_wildcard_configuration_is_rejected_without_detection(self):
        with (
            patch.dict(os.environ, {"SMARTSTOCK_CORS_ORIGINS": "http://localhost:5173, *"}, clear=True),
            patch.object(main, "detect_lan_origin") as detect,
        ):
            with self.assertRaises(ValueError):
                main.get_cors_origins()
        detect.assert_not_called()

    def test_detection_formats_origin_and_closes_socket(self):
        connection = MagicMock()
        connection.__enter__.return_value = connection
        connection.getsockname.return_value = ("192.168.1.20", 54321)
        with patch.object(main.socket, "socket", return_value=connection):
            self.assertEqual(main.detect_lan_origin(), "http://192.168.1.20:5173")
        connection.__exit__.assert_called_once()

    def test_socket_creation_and_route_failures_are_handled(self):
        with patch.object(main.socket, "socket", side_effect=OSError("socket unavailable")):
            self.assertIsNone(main.detect_lan_origin())

        connection = MagicMock()
        connection.__enter__.return_value = connection
        connection.connect.side_effect = OSError("no route")
        with patch.object(main.socket, "socket", return_value=connection):
            self.assertIsNone(main.detect_lan_origin())
        connection.__exit__.assert_called_once()


if __name__ == "__main__":
    unittest.main()
