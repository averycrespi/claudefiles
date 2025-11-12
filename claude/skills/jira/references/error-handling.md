# Error Handling Reference

This reference documents common errors when using ACLI and their recovery patterns.

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

## Not Found Errors

### 404 Not Found

**Symptom**: Issue, board, or project not found

**Recovery Pattern**:
1. Provide graceful error message
2. Offer to search for similar items
3. Continue conversation without disruption

**Example Response**:
```
Unable to find issue PROJ-999. Would you like to search for similar issues?
```

## Permission Errors

### 403 Forbidden

**Symptom**: User lacks permission to access resource

**Recovery Pattern**:
```
Permission denied for {KEY}. Check with Jira administrator for access.
```

## Rate Limiting

### 429 Too Many Requests

**Symptom**: API rate limit exceeded

**Recovery Pattern**:
```
Jira API rate limit reached. Wait 2 minutes before retrying.
```

## Network Errors

### Connection Timeout / Network Unreachable

**Symptom**: Unable to reach Jira API

**Recovery Pattern**:
1. Retry once with 5-second delay
2. If second attempt fails: "Unable to reach Jira API. Check network connection."

## Query Errors

### Invalid JQL Syntax

**Symptom**: JQL query parsing fails

**Recovery Pattern**:
1. Log the error for debugging
2. Simplify the query
3. Prompt user: "JQL query invalid. Try a more specific search?"

## Installation Errors

### ACLI Not Installed

**Symptom**: `acli` command not found

**Diagnosis**: Check if ACLI is installed
```bash
which acli
```

**Recovery Pattern**:
1. Guide user to install: "ACLI not installed. Run: brew install acli"
2. Disable skill for the session to avoid repeated errors

## General Error Handling Principles

1. **Graceful degradation**: Never let Jira errors disrupt the conversation flow
2. **Actionable guidance**: Always provide clear next steps for recovery
3. **Context preservation**: Continue assisting with other tasks while resolving errors
4. **Single retry**: For transient errors, retry once before reporting failure
5. **User empowerment**: Provide commands users can run themselves to diagnose/fix issues
