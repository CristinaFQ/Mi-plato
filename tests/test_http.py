import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import AppHandler


class HttpResponseTests(unittest.TestCase):
    def handler(self):
        handler = object.__new__(AppHandler)
        handler.path = '/api/catalogo'
        handler.send_response = Mock()
        handler.send_header = Mock()
        handler.end_headers = Mock()
        handler.wfile = io.BytesIO()
        handler.close_connection = False
        return handler

    def test_catalogue_response_is_valid_json(self):
        handler = self.handler()
        payload = {'total': 135, 'grupos': []}
        with patch('server.api_response', return_value=(200, payload)) as api:
            handler.do_GET()
        api.assert_called_once_with('/api/catalogo', {})
        handler.send_response.assert_called_once_with(200)
        self.assertEqual(json.loads(handler.wfile.getvalue()), payload)
        self.assertFalse(handler.close_connection)

    def test_cancelled_connections_do_not_raise_server_exceptions(self):
        for error in (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            with self.subTest(error=error):
                handler = self.handler()
                handler.wfile = Mock()
                handler.wfile.write.side_effect = error('client disconnected')
                with patch('server.api_response', return_value=(200, {'total': 135})):
                    handler.do_GET()
                self.assertTrue(handler.close_connection)

    def test_disconnect_while_sending_headers_is_also_handled(self):
        handler = self.handler()
        handler.end_headers.side_effect = ConnectionResetError('refresh')
        with patch('server.api_response', return_value=(200, {'total': 135})):
            handler.do_GET()
        self.assertTrue(handler.close_connection)

    def test_unrelated_application_errors_are_not_hidden(self):
        handler = self.handler()
        with patch('server.api_response', side_effect=ValueError('unexpected error')):
            with self.assertRaises(ValueError):
                handler.do_GET()

    def test_assets_and_api_responses_disable_stale_browser_cache(self):
        handler = self.handler()
        # Use the real override rather than the response mock.
        with patch('http.server.SimpleHTTPRequestHandler.end_headers') as parent:
            AppHandler.end_headers(handler)
        handler.send_header.assert_called_once_with('Cache-Control', 'no-store')
        parent.assert_called_once_with()
