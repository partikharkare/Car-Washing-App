#!/bin/bash
# End-to-end happy path: quote -> book -> dispatch -> accept -> arrive/service/complete -> capture
set -e
B=${BASE_URL:-http://localhost:4000}
echo "== health =="; curl -s $B/health; echo
EXP=$(node -e "console.log(new Date(Date.now()+3600e3).toISOString())")
Q=$(curl -s -X POST $B/v1/quotes -H 'Content-Type: application/json' -d "{\"currency\":\"INR\",\"serviceBaseMinor\":99900,\"vehicleTierMinor\":20000,\"addonsMinor\":[{\"label\":\"Wax\",\"amountMinor\":15000}],\"travelMinor\":5000,\"taxRateBps\":500,\"feeMinor\":2000,\"discountMinor\":5000,\"expiresAt\":\"$EXP\",\"includedTasks\":[\"foam wash\"],\"excludedTasks\":[\"engine bay\"],\"expectedDurationMin\":60}")
echo "$Q" | head -c 400; echo
QID=$(echo "$Q" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).quote.id))")
SCH=$(node -e "console.log(new Date(Date.now()+86400e3).toISOString())")
BK=$(curl -s -X POST $B/v1/bookings -H 'Content-Type: application/json' -d "{\"customerId\":\"cust_1\",\"vehicleId\":\"veh_1\",\"zoneId\":\"z1\",\"serviceType\":\"foam\",\"quoteId\":\"$QID\",\"scheduledStart\":\"$SCH\",\"idempotencyKey\":\"demo-$(date +%s)\"}")
echo "$BK" | head -c 500; echo
BID=$(echo "$BK" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).booking.id))")
NOW=$(node -e "console.log(new Date().toISOString())")
OF=$(curl -s -X POST $B/v1/dispatch/offers -H 'Content-Type: application/json' -d "{\"bookingId\":\"$BID\",\"zoneId\":\"z1\",\"serviceType\":\"foam\",\"requiredSkill\":\"doorstep-foam\",\"withinOpenHours\":true,\"maxTravelMin\":30,\"batchSize\":2,\"ttlSec\":120,\"payoutEstimateMinor\":50000,\"candidates\":[{\"id\":\"p1\",\"zoneIds\":[\"z1\"],\"onShift\":true,\"status\":\"active\",\"skills\":[\"doorstep-foam\"],\"equipmentOk\":true,\"capacityRemaining\":2,\"roadEtaMin\":8,\"reliabilityScore\":0.9,\"offersToday\":1,\"completedToday\":1,\"lastSeenAt\":\"$NOW\"}]}")
echo "$OF" | head -c 500; echo
OID=$(echo "$OF" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).offers[0].id))")
curl -s -X POST $B/v1/offers/$OID/accept -H 'Content-Type: application/json' -d '{}'; echo
for s in en_route arrived in_service completed; do curl -s -X POST $B/v1/bookings/$BID/transitions -H 'Content-Type: application/json' -d "{\"to\":\"$s\",\"actor\":\"partner\"}"; echo; done
AU=$(curl -s -X POST $B/v1/payments/authorize -H 'Content-Type: application/json' -d "{\"bookingId\":\"$BID\",\"token\":\"tok_demo\",\"idempotencyKey\":\"auth-$(date +%s)\"}"); echo "$AU"; echo
PREF=$(echo "$AU" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).providerRef))")
curl -s -X POST $B/v1/payments/capture -H 'Content-Type: application/json' -d "{\"bookingId\":\"$BID\",\"providerRef\":\"$PREF\",\"idempotencyKey\":\"cap-$(date +%s)\"}"; echo
curl -s $B/v1/metrics/pilot; echo
