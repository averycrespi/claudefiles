#!/usr/bin/env python3
"""Retrieve Datadog API credentials from macOS Keychain."""

import subprocess

KEYCHAIN_SERVICE = "searching-datadog-logs"


class CredentialError(Exception):
    """Raised when credentials cannot be retrieved from Keychain."""
    pass


def _read_keychain(account):
    """Read a password from macOS Keychain."""
    result = subprocess.run(
        [
            "security",
            "find-generic-password",
            "-s", KEYCHAIN_SERVICE,
            "-a", account,
            "-w",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise CredentialError(
            f"Credential '{account}' not found in Keychain.\n"
            f"Store it with:\n"
            f"  security add-generic-password -s {KEYCHAIN_SERVICE} -a {account} -w <YOUR_KEY>\n"
        )
    return result.stdout.strip()


def get_credentials():
    """Return (api_key, app_key) from macOS Keychain.

    Raises CredentialError with setup instructions if keys are missing.
    """
    api_key = _read_keychain("api-key")
    app_key = _read_keychain("app-key")
    return api_key, app_key
