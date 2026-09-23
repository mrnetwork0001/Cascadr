# Cascadr backend — FastAPI + the autonomous agent loop.
FROM python:3.12-slim

# curl is used by the container healthcheck below.
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first so code edits do not bust the layer cache.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY research ./research
COPY check_config.py .

# SQLite lives here; mount a volume so the book and the paper journal
# survive a redeploy. Losing the journal means losing the trading history
# the submission is scored on.
RUN mkdir -p /data
ENV CASCADR_DB=/data/cascadr.db
VOLUME ["/data"]

EXPOSE 8010
HEALTHCHECK --interval=60s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8010/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8010"]
