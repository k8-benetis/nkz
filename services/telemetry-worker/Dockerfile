FROM python:3.11-slim AS base

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

COPY services/telemetry-worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY services/telemetry-worker/app.py ./app.py
COPY services/telemetry-worker/telemetry_worker ./telemetry_worker
COPY services/common ./common

EXPOSE 8080

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]

