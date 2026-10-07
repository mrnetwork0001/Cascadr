# Deploying Cascadr to a VPS

Two reasons this matters for the hackathon:

1. **The entry needs a runnable demo.** `localhost` is not runnable by a judge,
   and "accessible submission materials" is an invalidation criterion.
2. **The agent needs to be running.** Agentic Trading is scored 50% on paper
   trading results, and those accumulate in wall-clock time. Every hour the
   agent is not running is an hour of missing history.

Deploy first, tune later.

---

## 1. Prerequisites

```bash
# On the VPS
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker
```

Open port `4010` (frontend) in the firewall. The backend needs no public port:
the browser only calls same-origin `/api`, which the frontend server proxies to
the backend over the compose network.

## 2. Copy the project up

```bash
# From your laptop
rsync -av --exclude node_modules --exclude .next --exclude backend/.venv \
      --exclude 'backend/*.db*' --exclude .git \
      ./ user@your-vps:/opt/cascadr/
```

Note `backend/.env` is excluded by `.dockerignore` from the image, but rsync
will copy it. That is what you want - the container reads it via `env_file`.
Check it landed with the right permissions:

```bash
ssh user@your-vps 'chmod 600 /opt/cascadr/backend/.env'
```

## 3. Set the admin token and CORS origin

Every endpoint that writes, trades or spends LLM credits is locked behind an
admin token. Generate one into `backend/.env`:

```bash
echo "CASCADR_ADMIN_TOKEN=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')" \
  >> /opt/cascadr/backend/.env
```

Send it as the `X-Admin-Token` header when you call those endpoints. Without it
they answer 503, so a missing token fails closed.

`PUBLIC_SITE_URL` becomes the backend's CORS allow-list (reads only):

```bash
cd /opt/cascadr
echo "PUBLIC_SITE_URL=http://YOUR_VPS_IP:4010" > .env
```

## 4. Arm the agent

In `backend/.env`:

```bash
CASCADR_AUTONOMOUS=true      # exactly "true" - nothing else arms it
CASCADR_POLL_SECONDS=600     # sense every 10 minutes
CASCADR_SHOCK_FLOOR=0.25     # below this, no trade is even considered
CASCADR_MAX_LLM_PER_HOUR=60  # bounds spend if a feed floods
CASCADR_PAPER_EQUITY=100000  # starting equity of the paper account

CASCADR_PAPER_TRADING=true   # LEAVE THIS. See below.
```

**Leave paper trading on.** The track asks for a paper trading log, not live
P&L. Going live adds real financial risk and earns no additional score.

## 5. Run

```bash
docker compose up -d --build
docker compose logs -f backend
```

You should see:

```
[agent] autonomy ON - polling every 600s
[agent] 15 fresh headlines, acted on 0
```

Acting on 0 is normal and correct - most headlines are not disruptions.

## 6. Verify

```bash
curl -s http://YOUR_VPS_IP:4010/api/health | python3 -m json.tool
```

Check four things:

| Field | Expect |
| --- | --- |
| `llm.configured` | `true` |
| `autonomous.armed` | `true` |
| `paper_trading` | `true` |
| `sweep.healthy` | `true` |
| `admin_endpoints` | `true` (a token is configured) |

Then open `http://YOUR_VPS_IP:4010/terminal` and check the status bar: `API`,
`AGENT`, `LLM`, `NEWS` and `BITGET` should all be green. There is no local
fallback - if the API is unreachable, the panels say so.

Confirm the write endpoints are locked:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://YOUR_VPS_IP:4010/api/agent/cycle
# 401 (or 503 if no token is configured) - never 200
```

## 7. Watch it work

```bash
# Decisions, including the refusals - the refusals are the interesting part
curl -s http://YOUR_VPS_IP:4010/api/agent/decisions | python3 -m json.tool | head -50

# Paper performance, which is half the Agentic Trading score
curl -s http://YOUR_VPS_IP:4010/api/paper/report | python3 -m json.tool

# Exposure and cluster concentration
curl -s http://YOUR_VPS_IP:4010/api/risk | python3 -m json.tool
```

To get a push on your phone for every trade, set a long random
`CASCADR_ALERT_NTFY_TOPIC` in `backend/.env`, restart the API, and subscribe
to that topic in the ntfy app (or open `https://ntfy.sh/<topic>`).

---

## If you add a domain

Put Caddy in front for TLS. With Docker Compose, send everything to the
frontend; it forwards `/api` to the backend itself:

```
your-domain.com { reverse_proxy localhost:4010 }
```

If the backend listens on the host instead (as on the live deployment), route
`/api/*` straight to it, stripping the prefix:

```
your-domain.com {
    handle_path /api/* {
        reverse_proxy localhost:8010
    }
    reverse_proxy localhost:4010
}
```

Then set `PUBLIC_SITE_URL=https://your-domain.com`. Nothing is baked into the
frontend bundle, so no rebuild is needed.

The live deployment runs this way without Docker: two systemd units
(`cascadr-api` on 127.0.0.1:8010, `cascadr-web` on 127.0.0.1:4010 with
`BACKEND_INTERNAL_URL=http://127.0.0.1:8010`) behind a Caddy site block.

## Data you must not lose

The `cascadr-data` volume holds the position book **and the paper-trading
journal**. That journal is the evidence the submission is scored on and cannot
be reconstructed after the fact. Back it up before any risky change:

```bash
docker run --rm -v cascadr_cascadr-data:/data -v $PWD:/backup alpine \
  tar czf /backup/cascadr-data-$(date +%F).tar.gz /data
```
