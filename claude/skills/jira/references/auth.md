# Authentication Commands

This reference documents ACLI authentication commands for Jira integration.

## Getting Help

Use the `--help` flag at any command level to get detailed information:

```bash
acli jira auth --help
acli jira auth status --help
```

## Check Authentication Status

```bash
acli jira auth status
```

Returns current authentication state and connected Jira instance.

**Usage:**
- Use this to verify ACLI is authenticated before making other commands
- Check authentication when encountering 401 Unauthorized errors
- Always use this for diagnostics before reporting authentication failures

**Example:**
```bash
acli jira auth status
```

**Expected Output:**
```
Authenticated as: user@example.com
Jira instance: https://yourcompany.atlassian.net
```

## Login

```bash
acli jira auth login
```

**Important Notes:**
- **Requires interactive input** - Cannot be automated
- **Guide user** to run this command manually if authentication fails
- This command prompts for Jira URL, email, and API token
- API tokens can be created at: https://id.atlassian.com/manage-profile/security/api-tokens

**Recovery Pattern:**
When authentication fails, provide clear guidance:
```
ACLI authentication expired. Run: acli jira auth login
```

## Authentication Errors

### 401 Unauthorized / Authentication Failure

**Symptom**: Commands fail with authentication errors

**Diagnosis**: Check authentication status
```bash
acli jira auth status
```

**Recovery**: Guide user to re-authenticate
```
ACLI authentication expired. Run: acli jira auth login
```

**Handling in Conversation:**
1. Gracefully acknowledge the authentication issue
2. Provide clear command for user to run manually
3. Offer to continue with other non-Jira tasks while user authenticates
4. Do not repeatedly attempt commands that require authentication
