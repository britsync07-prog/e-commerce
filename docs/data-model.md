# Backend Data Model

Minimum tables/entities needed for V1.

## Tenant and Access

- `users`: name, email, phone, language, status.
- `shops`: owner, name, subdomain, country, currency, language, timezone, category.
- `shop_members`: user, shop, role, status, last_active.
- `roles_permissions`: fixed role permissions for inbox, orders, products, payments, exports, billing.
- `sessions`, `invites`, `audit_logs`.

## Catalog

- `products`: shop, name, sku, category, description, status, price, compare_price, cost.
- `product_variants`: product, option values, price override, stock fields.
- `asset_objects`: shop-owned file metadata, storage driver, object key, public URL, MIME, byte size.
- `product_images`: product/variant, asset, sort order.
- `inventory_ledger`: product/variant, delta, reason, staff, order, timestamp.
- `inventory_reservations`: variant, quantity, status, reference, expiry.
- `categories`.

## Storefront

- `themes`: shop, template, colors, font set, sections, banners.
- `storefront_pages`: shop, SEO/share fields, policy links.
- `checkout_links`: shop, product/order draft, expiry, status.

## Customers and Messaging

- `customers`: shop, name, phone, language, tags, risk flags.
- `customer_addresses`.
- `conversations`: shop, channel, external buyer id, status, intent, assigned staff.
- `messages`: conversation, sender, text, attachments, timestamp, ai metadata.
- `ai_drafts`: conversation/message/order, draft text, confidence, source refs, status.

## Orders

- `order_drafts`: conversation/checkout/manual source, extracted fields, confidence.
- `orders`: shop, source, status, buyer snapshot, totals, risk score, staff owner.
- `order_items`: order, product snapshot, variant snapshot, quantity, price.
- `order_timeline`: order, status/action, actor, reason, timestamp.
- `order_issues`: duplicate, bad address, payment missing, courier failed.

## Delivery

- `courier_accounts`: shop, provider, credential ref, pickup address, service type, status.
- `shipments`: order, provider, tracking id, fee, COD amount, status.
- `tracking_events`: shipment, status, time, location, source, raw payload.
- `failed_deliveries`: shipment, reason, contact result, reschedule date.

## Payments

- `payments`: order, method, expected, paid, status, transaction id, proof file.
- `payment_events`: payment, action, actor, amount, reason, timestamp.
- `cod_settlements`: courier, statement refs, collected amount, fee, settlement date.
- `refund_disputes`.

## Growth and Analytics

- `coupons`, `segments`, `campaigns`, `consents`.
- `meta_connections`, `ad_events`, `campaign_stats`, `catalog_sync_runs`.
- `analytics_events`: normalized event stream for dashboards.
- `ai_commands`, `ai_action_approvals`, `ai_action_audit`.
