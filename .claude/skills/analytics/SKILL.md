---
name: Analytics
description: Query PostHog analytics for the Alive application. Pageviews, users, sessions, referrers, devices, countries, custom events, and trends.
---

# PostHog Analytics

Query PostHog analytics from any server. PostHog runs on Server 2 but the API is reachable anywhere via HTTPS.

## Setup

```bash
PH_KEY=$(grep POSTHOG_PERSONAL_API_KEY apps/web/.env.production | cut -d= -f2)
PH="https://posthog.homecatch.nl/api/projects/2/query/"
AUTH="Authorization: Bearer $PH_KEY"
```

## How to Query

**IMPORTANT**: Always write query JSON to temp files (`-d @/tmp/ph_*.json`). Shell quoting with `$` in PostHog property names (`$pageview`, `$pathname`, etc.) breaks otherwise.

PostHog supports two query kinds:
- **HogQLQuery**: Raw SQL-like queries for flexible data extraction
- **TrendsQuery**: Time-series data with built-in math (totals, DAU, WAU, MAU)

## Run All Core Queries

When the user asks about analytics, run ALL of these in parallel to give a full picture. Adjust the interval (`7 day`, `30 day`, `90 day`) based on what the user asks.

### 1. DAU Trend

```bash
cat > /tmp/ph_trend.json << 'EOF'
{"query":{"kind":"TrendsQuery","dateRange":{"date_from":"-7d"},"interval":"day","series":[{"kind":"EventsNode","event":"$pageview","math":"total"},{"kind":"EventsNode","event":"$pageview","math":"dau"}],"filterTestAccounts":true}}
EOF

curl -s -X POST "$PH" -H "$AUTH" -H "Content-Type: application/json" -d @/tmp/ph_trend.json | python3 -c "
import sys, json
d = json.load(sys.stdin)
for series in d.get('results', []):
    math = series['action']['math']
    print(f'--- {math} ---')
    for day, val in zip(series['days'], series['data']):
        print(f'  {day}: {int(val)}')
"
```

### 2. Top Pages

```bash
cat > /tmp/ph_pages.json << 'EOF'
{"query":{"kind":"HogQLQuery","query":"SELECT properties.\"$pathname\" as path, properties.\"$host\" as host, count() as cnt, count(DISTINCT person_id) as users FROM events WHERE event = '$pageview' AND timestamp > now() - interval 7 day GROUP BY path, host ORDER BY cnt DESC LIMIT 20"}}
EOF

curl -s -X POST "$PH" -H "$AUTH" -H "Content-Type: application/json" -d @/tmp/ph_pages.json | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'{\"Views\":>6}  {\"Users\":>5}  Page')
print('-' * 60)
for row in d.get('results', []):
    print(f'{row[2]:>6}  {row[3]:>5}  {row[1]}{row[0]}')
"
```

### 3. Session Stats

```bash
cat > /tmp/ph_sessions.json << 'EOF'
{"query":{"kind":"HogQLQuery","query":"SELECT count(DISTINCT properties.\"$session_id\") as sessions, count(DISTINCT person_id) as unique_users, count() as total_events FROM events WHERE timestamp > now() - interval 7 day AND properties.\"$session_id\" IS NOT NULL"}}
EOF

curl -s -X POST "$PH" -H "$AUTH" -H "Content-Type: application/json" -d @/tmp/ph_sessions.json | python3 -c "
import sys, json
r = json.load(sys.stdin)['results'][0]
print(f'Sessions:      {r[0]}')
print(f'Unique users:  {r[1]}')
print(f'Total events:  {r[2]}')
"
```

### 4. Referrer Sources

```bash
cat > /tmp/ph_referrers.json << 'EOF'
{"query":{"kind":"HogQLQuery","query":"SELECT properties.\"$referring_domain\" as referrer, count() as cnt, count(DISTINCT person_id) as users FROM events WHERE event = '$pageview' AND timestamp > now() - interval 7 day AND referrer != '' AND referrer IS NOT NULL GROUP BY referrer ORDER BY cnt DESC LIMIT 15"}}
EOF

curl -s -X POST "$PH" -H "$AUTH" -H "Content-Type: application/json" -d @/tmp/ph_referrers.json | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'{\"Views\":>6}  {\"Users\":>5}  Referrer')
print('-' * 50)
for row in d.get('results', []):
    print(f'{row[1]:>6}  {row[2]:>5}  {row[0] or \"(direct)\"}')
"
```

### 5. Browsers & Devices

```bash
cat > /tmp/ph_browsers.json << 'EOF'
{"query":{"kind":"HogQLQuery","query":"SELECT properties.\"$browser\" as browser, properties.\"$device_type\" as device, count() as cnt FROM events WHERE event = '$pageview' AND timestamp > now() - interval 7 day GROUP BY browser, device ORDER BY cnt DESC LIMIT 10"}}
EOF

curl -s -X POST "$PH" -H "$AUTH" -H "Content-Type: application/json" -d @/tmp/ph_browsers.json | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'{\"Views\":>6}  Browser / Device')
print('-' * 40)
for row in d.get('results', []):
    print(f'{row[2]:>6}  {row[0] or \"Unknown\"} ({row[1] or \"Unknown\"})')
"
```

### 6. Countries

```bash
cat > /tmp/ph_countries.json << 'EOF'
{"query":{"kind":"HogQLQuery","query":"SELECT properties.\"$geoip_country_name\" as country, count() as cnt, count(DISTINCT person_id) as users FROM events WHERE event = '$pageview' AND timestamp > now() - interval 7 day GROUP BY country ORDER BY cnt DESC LIMIT 15"}}
EOF

curl -s -X POST "$PH" -H "$AUTH" -H "Content-Type: application/json" -d @/tmp/ph_countries.json | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(f'{\"Views\":>6}  {\"Users\":>5}  Country')
print('-' * 40)
for row in d.get('results', []):
    print(f'{row[1]:>6}  {row[2]:>5}  {row[0] or \"(unknown)\"}')
"
```

### 7. Custom Events (non-$ events)

```bash
cat > /tmp/ph_custom.json << 'EOF'
{"query":{"kind":"HogQLQuery","query":"SELECT event, count() as cnt, count(DISTINCT person_id) as users FROM events WHERE timestamp > now() - interval 7 day AND NOT startsWith(event, '$') GROUP BY event ORDER BY cnt DESC LIMIT 20"}}
EOF

curl -s -X POST "$PH" -H "$AUTH" -H "Content-Type: application/json" -d @/tmp/ph_custom.json | python3 -c "
import sys, json
d = json.load(sys.stdin)
results = d.get('results', [])
if not results:
    print('No custom events tracked yet.')
else:
    print(f'{\"Count\":>6}  {\"Users\":>5}  Event')
    print('-' * 40)
    for row in results:
        print(f'{row[1]:>6}  {row[2]:>5}  {row[0]}')
"
```

## Presenting Results

After running all queries, present a clean summary:

1. **Overview table**: Total events, pageviews, sessions, unique users
2. **Daily trend**: Show the pageview/DAU numbers per day, note any patterns
3. **Top pages**: Which pages get the most traffic
4. **Traffic sources**: Where users come from
5. **Devices & geo**: Browser/device split and countries
6. **Key takeaways**: 3-5 bullet points on what stands out

## HogQL Reference

Common properties:
- `properties."$pathname"` - URL path
- `properties."$host"` - Domain
- `properties."$referring_domain"` - Referrer
- `properties."$browser"` - Browser name
- `properties."$device_type"` - Desktop/Mobile/Tablet
- `properties."$geoip_country_name"` - Country
- `properties."$session_id"` - Session identifier
- `properties."$current_url"` - Full URL

Date filters:
- `timestamp > now() - interval 7 day`
- `timestamp > now() - interval 30 day`

User counting:
- `count()` - total events
- `count(DISTINCT person_id)` - unique users
- `count(DISTINCT properties."$session_id")` - sessions

TrendsQuery math options: `total`, `dau`, `weekly_active`, `monthly_active`
