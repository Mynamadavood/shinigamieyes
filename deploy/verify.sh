#!/usr/bin/env bash
# Smoke verifier for the Shinigami Eyes deployment.
#   verify.sh --local                 run INSIDE the LXC as root
#   verify.sh --remote <https-url>    run from the dev PC (Git Bash) or the LXC
# Prints PASS/FAIL/SKIP lines and a final JSON summary line; exit 1 if any FAIL.
# Later-plan endpoints SKIP while they 404:
#   /api/profile = 01-04, /api/stream = 01-08, /api/places = 01-09.
# Never prints coordinates or secrets.
set -euo pipefail

PASS=0
FAIL=0
SKIP=0
P95_MS=null

pass() { echo "PASS $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL $1${2:+ ($2)}"; FAIL=$((FAIL + 1)); }
skip() { echo "SKIP $1${2:+ ($2)}"; SKIP=$((SKIP + 1)); }

# check <name> <command...> : PASS if the command succeeds
check() {
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then pass "$name"; else fail "$name"; fi
}

http_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$1" 2>/dev/null || echo 000; }

# in 100.64.0.0/10 (CGNAT, Tailscale range): 100.64.x.x - 100.127.x.x
in_cgnat() {
  local ip="$1" a b
  a="${ip%%.*}"; b="${ip#*.}"; b="${b%%.*}"
  [[ "$a" =~ ^[0-9]+$ && "$b" =~ ^[0-9]+$ ]] || return 1
  [ "$a" -eq 100 ] && [ "$b" -ge 64 ] && [ "$b" -le 127 ]
}

# PLAT-04 on the host: p95 of 20 sequential /api/profile requests <= 300 ms.
# In --remote mode this includes Tailscale RTT (conservative upper bound).
profile_p95() {
  local base="$1" path="/api/profile" code body id times p95
  code="$(http_code "$base/api/places")"
  if [ "$code" = "200" ]; then
    body="$(curl -s --max-time 10 "$base/api/places" || true)"
    id="$(printf '%s' "$body" | sed -n 's/.*"id" *: *"\([^"]*\)".*/\1/p' | head -n1)"
    [ -n "$id" ] && path="/api/profile?place=$id"
  fi
  code="$(http_code "$base$path")"
  if [ "$code" = "404" ]; then skip profile_p95 "/api/profile not built yet"; return 0; fi
  if [ "$code" != "200" ]; then fail profile_p95 "HTTP $code"; return 0; fi
  curl -s -o /dev/null --max-time 10 "$base$path" || true # warm-up
  times="$(for _ in $(seq 1 20); do curl -s -o /dev/null -w '%{time_total}\n' --max-time 10 "$base$path"; done | sort -n)"
  p95="$(printf '%s\n' "$times" | sed -n '19p' | awk '{printf "%d", $1 * 1000 + 0.5}')"
  P95_MS="$p95"
  if [ "$p95" -le 300 ]; then pass "profile_p95 ${p95}ms"; else fail "profile_p95 ${p95}ms > 300ms"; fi
}

verify_local() {
  local base=http://127.0.0.1:8000 listeners fqdn out i ok

  check unit_enabled systemctl is-enabled --quiet shinigami
  check unit_active systemctl is-active --quiet shinigami
  if [ "$(systemctl show shinigami -p Restart 2>/dev/null)" = "Restart=always" ]; then pass restart_always; else fail restart_always; fi

  listeners="$(ss -ltnH 2>/dev/null || true)"
  if printf '%s\n' "$listeners" | awk '{print $4}' | grep -qx '127.0.0.1:8000'; then pass bind_loopback; else fail bind_loopback; fi
  if printf '%s\n' "$listeners" | awk '{print $4}' | grep -qE '^(0\.0\.0\.0|\[::\]|\*):8000$'; then fail bind_not_wildcard; else pass bind_not_wildcard; fi

  if curl -fsS --max-time 5 "$base/api/health" 2>/dev/null | grep -q '"ok"'; then pass health_local; else fail health_local; fi

  out="$(tailscale serve status 2>&1 || true)"
  if printf '%s' "$out" | grep -q 'tailnet only' && printf '%s' "$out" | grep -q '127.0.0.1:8000'; then pass serve_tailnet_only; else fail serve_tailnet_only; fi

  out="$(tailscale funnel status 2>&1 || true)"
  if printf '%s' "$out" | grep -q 'Funnel on'; then fail funnel_off; else pass funnel_off; fi

  fqdn="$(tailscale status --json 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"])' 2>/dev/null || true)"
  echo "INFO fqdn=${fqdn:-unknown}"
  case "$fqdn" in shinigami.*) pass frozen_hostname ;; *) fail frozen_hostname "got '${fqdn:-none}'" ;; esac

  # PLAT-07: restart after SIGKILL
  systemctl kill -s SIGKILL shinigami || true
  ok=0
  for i in $(seq 1 15); do
    sleep 1
    if systemctl is-active --quiet shinigami && curl -fsS --max-time 2 "$base/api/health" >/dev/null 2>&1; then ok=1; break; fi
  done
  if [ "$ok" -eq 1 ]; then pass restart_after_sigkill; else fail restart_after_sigkill; fi

  # journald hygiene: no coordinates logged
  if journalctl -u shinigami --since "-24h" --no-pager 2>/dev/null | grep -qE 'lat=|lon=|-3[0-9]\.[0-9]{4,}'; then
    fail journald_no_coords
  else
    pass journald_no_coords
  fi

  for f in /etc/shinigami/.env /etc/shinigami/places.toml; do
    if [ "$(stat -c '%a' "$f" 2>/dev/null || echo none)" = "640" ]; then pass "mode640 $f"; else fail "mode640 $f"; fi
  done

  profile_p95 "$base"
}

verify_remote() {
  local url="${1%/}" host ip hdrs n ok i code body ans

  host="${url#https://}"; host="${host%%/*}"
  if [[ "$url" == https://* && "$host" =~ ^shinigami\.[a-z0-9-]+\.ts\.net$ ]]; then
    pass hostname_shape
  else
    fail hostname_shape "expected https://shinigami.<tailnet>.ts.net"
    return 0
  fi

  ok=0
  for i in $(seq 1 12); do # warm-up: first request may wait on cert issuance
    if curl -fsS --max-time 10 "$url/api/health" >/dev/null 2>&1; then ok=1; break; fi
    sleep 5
  done
  if [ "$ok" -eq 1 ]; then pass health_tls; else fail health_tls "no response in 60 s"; return 0; fi

  ip="$(curl -s -o /dev/null -w '%{remote_ip}' --max-time 10 "$url/api/health" 2>/dev/null || true)"
  if in_cgnat "$ip"; then pass tailnet_ip; else fail tailnet_ip "remote_ip not in 100.64.0.0/10"; fi

  hdrs="$(curl -sI --max-time 10 "$url/" | tr -d '\r')"
  if printf '%s' "$hdrs" | grep -qi '^content-security-policy:'; then pass csp_header; else fail csp_header; fi

  hdrs="$(curl -sI --max-time 10 "$url/sw.js" | tr -d '\r')"
  if printf '%s' "$hdrs" | grep -qi '^cache-control:.*no-cache'; then pass sw_no_cache; else fail sw_no_cache; fi

  if [ "$(http_code "$url/manifest.webmanifest")" = "200" ]; then pass manifest; else fail manifest; fi

  # SSE through serve must be unbuffered
  n="$(curl -sN --max-time 6 "$url/api/_sse_probe?n=60" 2>/dev/null | grep -c '^event: tick' || true)"
  if [ "${n:-0}" -ge 3 ]; then pass sse_unbuffered; else fail sse_unbuffered "ticks=${n:-0}"; fi

  # public DNS must not resolve to a routable address
  ans="$(curl -s --max-time 10 "https://dns.google/resolve?name=${host}&type=A" | grep -oE '"data" *: *"[0-9.]+"' | grep -oE '[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' || true)"
  ok=1
  for ip in $ans; do in_cgnat "$ip" || ok=0; done
  if [ "$ok" -eq 1 ]; then pass public_dns_not_routable; else fail public_dns_not_routable; fi

  # later-plan endpoints
  code="$(http_code "$url/api/profile")"
  if [ "$code" = "404" ]; then skip profile_sun "01-04"
  elif curl -s --max-time 10 "$url/api/profile" | grep -q '"sun"'; then pass profile_sun
  else fail profile_sun; fi

  code="$(http_code "$url/api/stream")"
  if [ "$code" = "404" ]; then skip stream_hello "01-08"
  # capture first: under pipefail, curl's timeout/SIGPIPE exit would mask a grep match
  elif sse="$(curl -sN --max-time 4 "$url/api/stream" 2>/dev/null || true)"; printf '%s' "$sse" | grep -q '^event: hello'; then pass stream_hello
  else fail stream_hello; fi

  code="$(http_code "$url/api/places")"
  if [ "$code" = "404" ]; then skip places_no_coords "01-09"
  elif [ "$code" = "200" ]; then
    body="$(curl -s --max-time 10 "$url/api/places")"
    if printf '%s' "$body" | grep -q '"lat"'; then fail places_no_coords; else pass places_no_coords; fi
  else fail places_no_coords "HTTP $code"; fi

  profile_p95 "$url"
}

MODE="${1:-}"
case "$MODE" in
  --local) verify_local ;;
  --remote)
    [ -n "${2:-}" ] || { echo "usage: verify.sh --remote <https-url>" >&2; exit 2; }
    verify_remote "$2" ;;
  *) echo "usage: verify.sh --local | --remote <https-url>" >&2; exit 2 ;;
esac

echo "{\"mode\":\"${MODE#--}\",\"pass\":$PASS,\"fail\":$FAIL,\"skip\":$SKIP,\"p95_ms\":$P95_MS}"
[ "$FAIL" -eq 0 ]
