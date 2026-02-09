#!/usr/bin/env python3
"""Tests for get_credentials module."""

import subprocess
import unittest
from unittest.mock import patch, MagicMock

from get_credentials import get_credentials, CredentialError


class TestGetCredentials(unittest.TestCase):
    @patch("get_credentials.subprocess.run")
    def test_returns_api_key_and_app_key(self, mock_run):
        mock_run.side_effect = [
            MagicMock(returncode=0, stdout="fake-api-key\n"),
            MagicMock(returncode=0, stdout="fake-app-key\n"),
        ]
        api_key, app_key = get_credentials()
        self.assertEqual(api_key, "fake-api-key")
        self.assertEqual(app_key, "fake-app-key")

    @patch("get_credentials.subprocess.run")
    def test_raises_on_missing_api_key(self, mock_run):
        mock_run.return_value = MagicMock(
            returncode=44, stdout="", stderr="security: SecKeychainSearchCopyNext"
        )
        with self.assertRaises(CredentialError) as ctx:
            get_credentials()
        self.assertIn("security add-generic-password", str(ctx.exception))

    @patch("get_credentials.subprocess.run")
    def test_strips_whitespace_from_keys(self, mock_run):
        mock_run.side_effect = [
            MagicMock(returncode=0, stdout="  key-with-spaces  \n"),
            MagicMock(returncode=0, stdout="  app-key  \n"),
        ]
        api_key, app_key = get_credentials()
        self.assertEqual(api_key, "key-with-spaces")
        self.assertEqual(app_key, "app-key")


if __name__ == "__main__":
    unittest.main()
