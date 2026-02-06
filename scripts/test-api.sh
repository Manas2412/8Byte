#!/usr/bin/env bash
# Optional API test script. Run with both backend and ws-server (and Redis) up.
# From repo root: ./scripts/test-api.sh
# Uses test@example.com / Test@1234 by default; set TEST_EMAIL and TEST_PASSWORD to override.

set -e
BASE="${BASE_URL:-http://localhost:4001}"
EMAIL="${TEST_EMAIL:-test@example.com}"
PASSWORD="${TEST_PASSWORD:-Test@1234}"
COOKIES="/tmp/8byte-test-cookies.txt"

echo "Base URL: $BASE"
echo "Signing in as $EMAIL ..."
curl -s -X POST "$BASE/api/v1/users/sign-in" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" \
  -c "$COOKIES" -b "$COOKIES" | head -c 200
echo ""

echo "Profile:"
curl -s -b "$COOKIES" "$BASE/api/v1/users/profile" | head -c 500
echo ""

echo "Portfolio enriched (may be 202 if queue still processing):"
curl -s -b "$COOKIES" "$BASE/api/v1/stocks/portfolio-enriched" | head -c 800
echo ""

echo "Done. Cookie file: $COOKIES"
