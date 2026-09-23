#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:4001}"
SUBDOMAIN="${SUBDOMAIN:-live-test-shop}"

shop_json=$(curl -sS -H 'Content-Type: application/json' \
  -d "{\"ownerName\":\"Live Tester\",\"language\":\"en\",\"shopName\":\"Live Test Shop\",\"subdomain\":\"$SUBDOMAIN\",\"category\":\"fashion\",\"country\":\"Bangladesh\",\"currency\":\"BDT\"}" \
  "$BASE_URL/api/v1/onboarding/start")

shop_id=$(printf '%s' "$shop_json" | node -e 'let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>console.log(JSON.parse(s).shop.id))')

curl -sS -H 'Content-Type: application/json' \
  -d '{"name":"Demo Panjabi","price":1250,"stock":12}' \
  "$BASE_URL/api/v1/onboarding/$shop_id/products" >/dev/null

curl -sS -H 'Content-Type: application/json' \
  -d '{"templateId":"test-fashion-basic"}' \
  "$BASE_URL/api/v1/onboarding/$shop_id/template" >/dev/null

curl -sS -H 'Content-Type: application/json' \
  -d '{}' \
  "$BASE_URL/api/v1/onboarding/$shop_id/channels/meta/skip" >/dev/null

curl -sS -X PATCH -H 'Content-Type: application/json' \
  -d '{"aiMode":"suggest"}' \
  "$BASE_URL/api/v1/onboarding/$shop_id/ai-mode" >/dev/null

curl -sS -H 'Content-Type: application/json' \
  -d '{}' \
  "$BASE_URL/api/v1/onboarding/$shop_id/launch" |
  node -e 'let s=""; process.stdin.on("data",d=>s+=d); process.stdin.on("end",()=>{const j=JSON.parse(s); console.log(`${j.shop.subdomain} ${j.shop.status} ${j.shop.selectedTemplateId}`)})'

