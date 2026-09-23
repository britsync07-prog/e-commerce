# Live Test Hosting

Goal:
- Test launched shops on wildcard subdomains using the simple storefront.

## Components

- Backend API: `backend/`, default local port `4001`.
- Storefront renderer: `storefront/`, default local port `3000`.

## Local Test

1. Start backend:

```powershell
cd backend
npm run dev
```

2. Create and launch a shop through onboarding APIs.

3. Start storefront:

```powershell
cd storefront
npm run dev
```

4. Open:

```txt
http://127.0.0.1:3000/?shop=SHOP_SUBDOMAIN
```

## VPS Test

DNS:

```txt
A  api.yourdomain.com  YOUR_VPS_IP
A  *.yourdomain.com    YOUR_VPS_IP
```

Proxy:

```txt
api.yourdomain.com -> 127.0.0.1:4001
*.yourdomain.com   -> 127.0.0.1:3000
```

Storefront env:

```txt
BACKEND_URL=https://api.yourdomain.com
ROOT_DOMAIN=yourdomain.com
PORT=3000
```

Expected:

```txt
https://shop-subdomain.yourdomain.com
```

Storefront extracts `shop-subdomain`, calls:

```txt
https://api.yourdomain.com/api/v1/storefront/shop-subdomain
```

Then renders shop data with the selected test template.

