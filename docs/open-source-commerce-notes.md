# Open Source Commerce Notes

Research sources:

- ShopNex: setup flow chooses database, optional features, env config, storefront choice, import mapping.
- Vendure: TypeScript backend, one extensible commerce core, plugin contracts, SQL database, Docker/cloud deploy.
- Saleor: API-only/headless commerce, separate dashboard/storefront, strong product/order/customer/payment model.

Decisions for this project:

- Keep modular monolith first, not microservices.
- Keep API docs beside every route.
- Treat onboarding as a guided setup state machine.
- Make website-only launch possible before Meta integration.
- Use source-of-truth backend validation for subdomain, product, policy, and launch.
- Templates/design research stays separate; no storefront templates in this feature.

