#!/usr/bin/env python3
"""Tests for get_log script."""

import json
import unittest
from unittest.mock import patch, MagicMock

from get_log import get_log


class TestGetLog(unittest.TestCase):
    @patch("get_log.get_credentials")
    @patch("get_log.urllib.request.urlopen")
    def test_returns_log_by_id(self, mock_urlopen, mock_creds):
        mock_creds.return_value = ("api-key", "app-key")
        response_data = {
            "data": {
                "id": "abc123",
                "type": "log",
                "attributes": {
                    "message": "Something happened",
                    "service": "web-api",
                    "status": "error",
                    "timestamp": "2025-01-01T00:00:00Z",
                },
            }
        }
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps(response_data).encode()
        mock_response.__enter__ = lambda s: s
        mock_response.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_response

        log = get_log("abc123")
        self.assertEqual(log["id"], "abc123")
        self.assertEqual(log["attributes"]["service"], "web-api")

    @patch("get_log.get_credentials")
    @patch("get_log.urllib.request.urlopen")
    def test_sends_correct_headers(self, mock_urlopen, mock_creds):
        mock_creds.return_value = ("my-api-key", "my-app-key")
        response_data = {"data": {"id": "abc123", "attributes": {}}}
        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps(response_data).encode()
        mock_response.__enter__ = lambda s: s
        mock_response.__exit__ = MagicMock(return_value=False)
        mock_urlopen.return_value = mock_response

        get_log("abc123")

        req = mock_urlopen.call_args[0][0]
        self.assertEqual(req.get_header("Dd-api-key"), "my-api-key")
        self.assertEqual(req.get_header("Dd-application-key"), "my-app-key")


if __name__ == "__main__":
    unittest.main()
