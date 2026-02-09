#!/usr/bin/env python3
"""Tests for search_logs script."""

import json
import unittest
from unittest.mock import patch, MagicMock
from urllib.error import HTTPError
from io import BytesIO

from search_logs import search_logs, build_request_body


class TestBuildRequestBody(unittest.TestCase):
    def test_minimal_query(self):
        body = build_request_body(query="service:web-api")
        self.assertEqual(body["filter"]["query"], "service:web-api")
        self.assertIn("from", body["filter"])
        self.assertIn("to", body["filter"])
        self.assertEqual(body["page"]["limit"], 100)

    def test_custom_time_range(self):
        body = build_request_body(
            query="status:error",
            time_from="2025-01-01T00:00:00Z",
            time_to="2025-01-02T00:00:00Z",
        )
        self.assertEqual(body["filter"]["from"], "2025-01-01T00:00:00Z")
        self.assertEqual(body["filter"]["to"], "2025-01-02T00:00:00Z")

    def test_custom_limit(self):
        body = build_request_body(query="*", limit=50)
        self.assertEqual(body["page"]["limit"], 50)

    def test_limit_capped_at_1000(self):
        body = build_request_body(query="*", limit=5000)
        self.assertEqual(body["page"]["limit"], 1000)

    def test_cursor_included_when_provided(self):
        body = build_request_body(query="*", cursor="abc123")
        self.assertEqual(body["page"]["cursor"], "abc123")


class TestSearchLogs(unittest.TestCase):
    @patch("search_logs.get_credentials")
    @patch("search_logs.urllib.request.urlopen")
    def test_returns_logs_from_single_page(self, mock_urlopen, mock_creds):
        mock_creds.return_value = ("api-key", "app-key")
        response_data = {
            "data": [
                {"id": "log1", "attributes": {"message": "hello"}},
                {"id": "log2", "attributes": {"message": "world"}},
            ],
            "meta": {"page": {}},
        }
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps(response_data).encode()
        mock_response.__enter__ = lambda s: s
        mock_response.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_response

        logs = search_logs(query="service:web-api")
        self.assertEqual(len(logs), 2)
        self.assertEqual(logs[0]["id"], "log1")

    @patch("search_logs.get_credentials")
    @patch("search_logs.urllib.request.urlopen")
    def test_paginates_until_no_cursor(self, mock_urlopen, mock_creds):
        mock_creds.return_value = ("api-key", "app-key")

        page1 = {
            "data": [{"id": "log1", "attributes": {}}],
            "meta": {"page": {"after": "cursor-page2"}},
        }
        page2 = {
            "data": [{"id": "log2", "attributes": {}}],
            "meta": {"page": {}},
        }

        resp1 = MagicMock()
        resp1.read.return_value = json.dumps(page1).encode()
        resp1.__enter__ = lambda s: s
        resp1.__exit__ = MagicMock(return_value=False)

        resp2 = MagicMock()
        resp2.read.return_value = json.dumps(page2).encode()
        resp2.__enter__ = lambda s: s
        resp2.__exit__ = MagicMock(return_value=False)

        mock_urlopen.side_effect = [resp1, resp2]

        logs = search_logs(query="*", limit=200)
        self.assertEqual(len(logs), 2)

    @patch("search_logs.get_credentials")
    @patch("search_logs.urllib.request.urlopen")
    def test_stops_at_limit(self, mock_urlopen, mock_creds):
        mock_creds.return_value = ("api-key", "app-key")
        response_data = {
            "data": [{"id": f"log{i}", "attributes": {}} for i in range(5)],
            "meta": {"page": {"after": "more"}},
        }
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps(response_data).encode()
        mock_response.__enter__ = lambda s: s
        mock_response.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_response

        logs = search_logs(query="*", limit=3)
        self.assertEqual(len(logs), 3)


if __name__ == "__main__":
    unittest.main()
