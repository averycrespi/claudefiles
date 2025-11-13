# Confluence Troubleshooting Guide

This guide covers common issues when using `confluence-search` and `confluence-view` scripts.

## Authentication Setup

### Required Environment Variables

Both scripts require three environment variables:

```bash
export CONFLUENCE_DOMAIN="mycompany.atlassian.net"  # or self-hosted domain
export CONFLUENCE_EMAIL="your.email@company.com"
export CONFLUENCE_API_TOKEN="your-api-token-here"
```

### Generating an API Token

For Atlassian Cloud instances:

1. Visit https://id.atlassian.com/manage-profile/security/api-tokens
2. Click "Create API token"
3. Give it a descriptive name (e.g., "Claude Code")
4. Copy the generated token (you won't see it again)
5. Add to your shell profile (`~/.zshrc` or `~/.bashrc`):
   ```bash
   export CONFLUENCE_API_TOKEN="your-token-here"
   ```

For self-hosted Confluence:
- Check with your administrator for API token generation
- Some self-hosted instances may use personal access tokens (PATs)
- Authentication method may vary by Confluence version

### Verifying Environment Variables

Check if variables are set:

```bash
echo "Domain: $CONFLUENCE_DOMAIN"
echo "Email: $CONFLUENCE_EMAIL"
echo "Token: ${CONFLUENCE_API_TOKEN:0:4}..." # Shows first 4 chars
```

If any are empty, the scripts will fail with:
```
Error: CONFLUENCE_DOMAIN environment variable is not set
Error: CONFLUENCE_EMAIL environment variable is not set
Error: CONFLUENCE_API_TOKEN environment variable is not set
```

## Common Authentication Errors

### HTTP 401: Unauthorized

**Symptoms**:
```json
{
  "statusCode": 401,
  "message": "Basic authentication with passwords is deprecated."
}
```
or
```json
{
  "message": "Client must be authenticated to access this resource."
}
```

**Causes**:
1. API token is invalid or expired
2. Email address doesn't match the token owner
3. Using password instead of API token
4. Token doesn't have sufficient permissions

**Solutions**:
- Generate a new API token and update `CONFLUENCE_API_TOKEN`
- Verify `CONFLUENCE_EMAIL` matches the account that created the token
- Ensure you're using an API token, not a password
- Check that your Confluence account has read access to the content

### HTTP 403: Forbidden

**Symptoms**:
```json
{
  "statusCode": 403,
  "message": "You do not have permission to access this resource"
}
```

**Causes**:
1. Account lacks permission to view the page/space
2. Page is in a restricted space
3. API token doesn't have correct scopes

**Solutions**:
- Verify you can access the page in the Confluence web UI
- Request access to the space from the space administrator
- For self-hosted: Check token permissions/scopes with admin

### HTTP 404: Not Found

**Symptoms**:
```json
{
  "statusCode": 404,
  "message": "Could not find content with id: 123456789"
}
```

**Causes**:
1. Page ID doesn't exist
2. Page was deleted
3. Wrong domain (cloud vs self-hosted)

**Solutions**:
- Verify page ID from the Confluence URL
- Check if page exists in web UI
- Confirm `CONFLUENCE_DOMAIN` is correct

## Domain Detection Issues

### Cloud vs Self-Hosted Confusion

The scripts auto-detect the API path based on domain:

- **Atlassian Cloud** (`.atlassian.net`): Uses `/wiki/rest/api`
- **Self-hosted**: Uses `/rest/api`

**If getting 404 on all requests**:
- Verify `CONFLUENCE_DOMAIN` format
- For cloud: Should be `company.atlassian.net`
- For self-hosted: Should be your custom domain (e.g., `confluence.company.com`)

**Manual API path testing**:
```bash
# Test if API is accessible
curl -s -u "$CONFLUENCE_EMAIL:$CONFLUENCE_API_TOKEN" \
  "https://$CONFLUENCE_DOMAIN/wiki/rest/api/space?limit=1"

# If that fails, try without /wiki prefix
curl -s -u "$CONFLUENCE_EMAIL:$CONFLUENCE_API_TOKEN" \
  "https://$CONFLUENCE_DOMAIN/rest/api/space?limit=1"
```

## Page ID Extraction Issues

### Invalid Page ID Format

**Symptoms**:
```
Error: Invalid page ID or URL format: xyz-abc
```

**Causes**:
Page ID must be numeric or a valid Confluence URL.

**Valid formats**:
```bash
confluence-view 123456789                                          # ✅ Direct ID
confluence-view "?pageId=123456789"                               # ✅ Query param
confluence-view "/pages/123456789/Page+Title"                     # ✅ Path-based
confluence-view "https://example.atlassian.net/wiki/spaces/DEV/pages/123456789/Title"  # ✅ Full URL
```

**Invalid formats**:
```bash
confluence-view "PAGE-123"      # ❌ Not Jira-style IDs
confluence-view "my-page"       # ❌ Not page slugs
confluence-view "/wiki/..."     # ❌ Need actual page ID
```

### Extracting Page IDs from URLs

To find page ID from Confluence URL, look for:

1. **Query parameter**: `?pageId=123456789`
2. **Path segment**: `/pages/123456789/Page+Title`
3. **View action**: `viewpage.action?pageId=123456789`

**Example URLs**:
```
https://company.atlassian.net/wiki/spaces/DEV/pages/123456789/Architecture
                                                           ^^^^^^^^^ This is the page ID

https://company.atlassian.net/wiki/viewpage.action?pageId=123456789
                                                            ^^^^^^^^^ This is the page ID
```

## Search Issues

### No Results Found

**Symptoms**:
```json
{
  "results": [],
  "size": 0,
  "totalSize": 0
}
```

**Causes**:
1. Query doesn't match any content
2. Content exists but you lack permissions
3. Search index hasn't updated yet (for very recent content)
4. Query syntax is too restrictive

**Solutions**:
- Try broader search terms
- Check if you can see the content in web UI
- Wait a few minutes for search index to update
- Use simpler queries without complex CQL

### Too Many Results

**Symptoms**:
Search returns hundreds/thousands of results.

**Solutions**:
- Use `--limit N` flag to control result count
- Add more specific search terms
- Filter by space if targeting specific area
- Use date filters for recent content only

### Special Characters in Queries

**Symptoms**:
Query with quotes, slashes, or other special characters fails.

**Solutions**:
The script handles quote escaping automatically. For other special characters:
- Use single quotes around the query: `confluence-search 'path/to/file'`
- Escape special characters if needed: `confluence-search "value\:123"`

## API Rate Limiting

### Rate Limit Errors

**Symptoms**:
```json
{
  "statusCode": 429,
  "message": "Rate limit exceeded"
}
```

**Causes**:
Too many API requests in short time period.

**Rate limits (Atlassian Cloud)**:
- **Standard**: ~20 requests per second per user
- **Premium**: Higher limits (check your plan)
- Limits are per user account, not per token

**Solutions**:
1. Wait 60 seconds before retrying
2. Reduce frequency of requests
3. Use `--limit` to fetch fewer results per request
4. For batch operations, add delays between requests
5. Consider using search instead of fetching pages individually

## Connection and Network Issues

### SSL/TLS Certificate Errors

**Symptoms**:
```
curl: (60) SSL certificate problem: certificate verify failed
```

**Solutions**:
- Update system CA certificates: `brew install ca-certificates` (macOS)
- For self-hosted with self-signed certs: Add cert to system trust store
- Emergency bypass (NOT RECOMMENDED): Add `-k` to curl command

### Connection Timeout

**Symptoms**:
```
curl: (28) Operation timed out
```

**Causes**:
1. Network connectivity issues
2. Confluence server is down
3. Firewall blocking requests
4. DNS resolution failure

**Solutions**:
- Check internet connection
- Verify Confluence is accessible in browser
- Check if VPN is required for self-hosted instances
- Test DNS: `nslookup $CONFLUENCE_DOMAIN`

## Output Parsing Issues

### JSON Parse Errors

**Symptoms**:
```
parse error: Invalid numeric literal at line 1, column 10
```

**Causes**:
1. API returned non-JSON response (usually HTML error page)
2. Incomplete response due to network interruption

**Solutions**:
- Check the raw response: Add `| cat` to see full output
- Look for HTML in response (indicates server error)
- Try request again (may be transient issue)
- Check Confluence status page for outages

### Missing Fields in Output

**Symptoms**:
Expected fields (like `content`) are missing from JSON.

**Causes**:
1. Using `--metadata` flag (intentionally excludes content)
2. Page has no content
3. API changed response format

**Solutions**:
- Remove `--metadata` flag for full content
- Check if page is empty in web UI
- Update scripts if API format changed

## Content Conversion Issues

### HTML to Markdown Conversion

When using `pandoc` to convert Confluence HTML:

```bash
confluence-view 123456789 | jq -r '.content' | pandoc -f html -t markdown
```

**Common issues**:
1. **Confluence-specific macros**: Converted to plain text or omitted
2. **Nested tables**: May not convert perfectly
3. **Attachments/images**: Links may break if not public

**Solutions**:
- Accept that conversion won't be perfect for complex content
- Use `-t gfm` for GitHub-flavored markdown
- Use `-t commonmark` for stricter markdown
- Add `--wrap=none` to prevent line wrapping

## Debugging Tips

### Enable Verbose Output

For `confluence-search`:
```bash
# Add debugging to see API call
confluence-search "query" 2>&1 | tee /tmp/confluence-debug.log
```

For `confluence-view`:
```bash
# See full API response
confluence-view 123456789 2>&1 | tee /tmp/confluence-view-debug.log
```

### Test API Directly

Bypass script to test API:
```bash
AUTH=$(echo -n "$CONFLUENCE_EMAIL:$CONFLUENCE_API_TOKEN" | base64)

# Test search
curl -v -H "Authorization: Basic $AUTH" \
  "https://$CONFLUENCE_DOMAIN/wiki/rest/api/search?cql=text~\"test\"&limit=5"

# Test content
curl -v -H "Authorization: Basic $AUTH" \
  "https://$CONFLUENCE_DOMAIN/wiki/rest/api/content/123456789?expand=body.storage"
```

### Check Script Permissions

Ensure scripts are executable:
```bash
ls -l $(which confluence-search)
ls -l $(which confluence-view)

# If not executable
chmod +x /path/to/scripts/confluence-search
chmod +x /path/to/scripts/confluence-view
```

### Verify Dependencies

Required tools:
- `curl` - HTTP client
- `jq` - JSON processor
- `base64` - Base64 encoding

Check installation:
```bash
which curl jq base64
curl --version
jq --version
```

## Getting Help

If issues persist:

1. **Check script versions**: Ensure scripts are up-to-date
2. **Review recent changes**: Check git history for script modifications
3. **Test in browser**: Verify same query works in Confluence UI
4. **Check API docs**: Confluence API may have changed
5. **Confluence status**: Check https://status.atlassian.com for outages

## Error Code Reference

| Status | Meaning | Common Causes |
|--------|---------|---------------|
| 200 | Success | Request completed successfully |
| 400 | Bad Request | Invalid CQL syntax, malformed query |
| 401 | Unauthorized | Invalid credentials, expired token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Invalid page ID, deleted content |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Server Error | Confluence internal error |
| 502 | Bad Gateway | Confluence temporarily unavailable |
| 503 | Service Unavailable | Confluence maintenance or overloaded |
