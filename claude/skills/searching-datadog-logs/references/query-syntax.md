# Datadog Log Query Syntax Reference

## Basic Search

- Free text search: `error timeout`
- Exact phrase: `"connection refused"`

## Facet Search

Search by indexed attributes using `@` prefix or reserved facets:

- Service: `service:web-api`
- Status: `status:error` (valid values: `emergency`, `alert`, `critical`, `error`, `warn`, `info`, `debug`)
- Host: `host:prod-server-01`
- Source: `source:python`
- Custom attribute: `@user.id:12345`
- Tag: `env:production`, `version:1.2.3`

## Operators

- Equals: `service:web-api`
- Not equals: `-service:web-api`
- Wildcard: `service:web-*`
- Numeric comparison: `@duration:>1000`, `@duration:[100 TO 500]`
- Exists: `_exists_:@user.id`
- Does not exist: `-_exists_:@user.id`

## Boolean Logic

- AND (implicit): `service:web-api status:error` (space = AND)
- AND (explicit): `service:web-api AND status:error`
- OR: `service:web-api OR service:worker`
- Grouping: `(service:web-api OR service:worker) AND status:error`

## Wildcards

- Single character: `service:web-?pi`
- Multiple characters: `service:web-*`
- Wildcards work in values, not in facet names

## Escaping

- Special characters need escaping with `\`: `+`, `-`, `=`, `&&`, `||`, `!`, `(`, `)`, `{`, `}`, `[`, `]`, `^`, `"`, `~`, `*`, `?`, `:`, `\`, `/`
- Example: `@message:file\.txt`

## Common Patterns

Search for errors in a service:
```
service:web-api status:error
```

Search for a specific error message:
```
service:web-api "NullPointerException"
```

Search by user and status:
```
@user.email:user@example.com status:error
```

Search with numeric range:
```
@http.status_code:[500 TO 599]
```

Exclude noisy logs:
```
service:web-api -@logger.name:HealthCheck
```
