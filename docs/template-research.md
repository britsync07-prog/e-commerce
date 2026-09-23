# Template Research

Only two internal test templates are active in backend onboarding.

System endpoint:

- `GET /api/v1/onboarding/templates`
- `POST /api/v1/onboarding/:shopId/template`

Active test templates:

- `test-fashion-basic`
- `test-gadget-basic`

Online repos checked, but not added to active system because license/reuse needs final review:

- https://github.com/saleor/storefront
- https://github.com/shadcnspace/ecommerce-shadcn-nextjs-template
- https://github.com/NextAdminHQ/nextjs-admin-dashboard
- https://github.com/slowfound/next-prisma-tailwind-ecommerce
- https://github.com/mohammadoftadeh/next-ecommerce-shopco

Selection criteria:

- Mobile-first commerce UX.
- Clean dashboard sidebar/table/drawer patterns.
- Tailwind or shadcn-compatible components.
- Accessible forms and validation.
- Product/catalog/order screens that can adapt to F-commerce.
- License allows reuse for commercial SaaS.

Current rule:

- Active templates are test-only and internal.
- Do not copy online template code until license is verified.
- Prefer MIT/permissive sources for first production implementation.
