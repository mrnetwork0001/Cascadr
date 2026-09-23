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

Open ports `4010` (frontend) and `8010` (backend) in the firewall.

## 2. Copy the project up

```bash
# From your laptop
rsync -av --exclude node_modules --exclude .next --exclude backend/.venv \
      --exclude 'backend/*.db*' --exclude .git \
      ./ user@your-vps:/opt/cascadr/
```

Note `backend/.env` is excluded by `.dockerignore` from the image, but rsync
will copy it. That is what you want — the container reads it via `env_file`.
Check it landed with the right permissions:

```bash
ssh user@your-vps 'chmod 600 /opt/cascadr/backend/.env'
```

## 3. Point the build at the public address

The frontend calls the API **from the browser**, so it needs an address the
browser can reach. An internal Docker hostname will not work.

```bash
cd /opt/cascadr
cat > .env <<'ENV'
PUBLIC_API_URL=http://YOUR_VPS_IP:8010
PUBLIC_SITE_URL=http://YOUR_VPS_IP:4010
ENV
```

Substitute a domain if you have one. `PUBLIC_SITE_URL` becomes the CORS
allow-list on the backend; get it wrong and the browser silently blocks every
API call while the site itself loads fine.

## 4. Arm the agent

In `backend/.env`:

```bash
CASCADR_AUTONOMOUS=true      # exactly "true" — nothing else arms it
CASCADR_POLL_SECONDS=600     # sense every 10 minutes
CASCADR_SHOCK_FLOOR=0.45     # below this, no trade is even considered
CASCADR_MAX_LLM_PER_HOUR=60  # bounds spend if a feed floods

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
[agent] autonomy ON — polling every 600s
[agent] 15 fresh headlines, acted on 0
```

Acting on 0 is normal and correct — most headlines are not disruptions.

## 6. Verify

```bash
curl -s http://YOUR_VPS_IP:8010/health | python3 -m json.tool
```

Check four things:

| Field | Expect |
| --- | --- |
| `llm.configured` | `true` |
| `autonomous.armed` | `true` |
| `paper_trading` | `true` |
| `sweep.healthy` | `true` |

Then open `http://YOUR_VPS_IP:4010` and confirm the terminal status bar reads
`ENGINE BACKEND`. If it reads `ENGINE LOCAL`, the browser cannot reach the API
— almost always `PUBLIC_API_URL` or CORS.

## 7. Watch it work

```bash
# Decisions, including the refusals — the refusals are the interesting part
curl -s http://YOUR_VPS_IP:8010/agent/decisions | python3 -m json.tool | head -50

# Paper performance, which is half the Agentic Trading score
curl -s http://YOUR_VPS_IP:8010/paper/report | python3 -m json.tool

# Exposure and cluster concentration
curl -s http://YOUR_VPS_IP:8010/risk | python3 -m json.tool
```

---

## If you add a domain

Put nginx or Caddy in front for TLS. Caddy is two lines:

```
your-domain.com      { reverse_proxy localhost:4010 }
api.your-domain.com  { reverse_proxy localhost:8010 }
```

Then set `PUBLIC_API_URL=https://api.your-domain.com` and
`PUBLIC_SITE_URL=https://your-domain.com` and rebuild the frontend
(`NEXT_PUBLIC_*` is baked in at build time, so a restart alone will not pick
it up).

## Data you must not lose

The `cascadr-data` volume holds the position book **and the paper-trading
journal**. That journal is the evidence the submission is scored on and cannot
be reconstructed after the fact. Back it up before any risky change:

```bash
docker run --rm -v cascadr_cascadr-data:/data -v $PWD:/backup alpine \
  tar czf /backup/cascadr-data-$(date +%F).tar.gz /data
```
