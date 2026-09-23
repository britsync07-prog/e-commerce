# Storefront

Tiny live-test storefront renderer.

## Local Run

```powershell
cd storefront
copy .env.example .env
npm run dev
```

Open:

```txt
http://127.0.0.1:3000/?shop=your-shop-subdomain
```

## VPS Routing

DNS:

```txt
A  *.yourdomain.com  YOUR_VPS_IP
```

Reverse proxy:

```txt
api.yourdomain.com       -> backend :4001
*.yourdomain.com         -> storefront :3000
dashboard.yourdomain.com -> dashboard later
```

Environment:

```txt
BACKEND_URL=https://api.yourdomain.com
ROOT_DOMAIN=yourdomain.com
PORT=3000
```

