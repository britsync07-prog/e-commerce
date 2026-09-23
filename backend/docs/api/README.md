# API Docs Rule

Every API route must have a matching Markdown doc in this folder.

## Required Per API

- Method and path.
- Purpose.
- Auth/permission.
- Request params/body.
- Response shape.
- Side effects.
- Audit/timeline behavior.
- Cache behavior.
- Errors.

## Check

```powershell
cd backend
npm run check:api-docs
```

