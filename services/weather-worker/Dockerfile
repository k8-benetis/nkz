FROM python:3.11-alpine

WORKDIR /app

# Install system dependencies (minimal for Alpine)
RUN apk add --no-cache \
    postgresql-client \
    gcc \
    musl-dev \
    postgresql-dev

# Copy requirements and install Python dependencies
COPY services/weather-worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy common modules first
COPY services/common /app/common

# Copy application code
COPY services/weather-worker /app/weather-worker

# Create non-root user
RUN adduser -D -u 1000 worker && chown -R worker:worker /app
USER worker

# Health check
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
    CMD pgrep -f "main.py" || exit 1

# Default command
CMD ["python", "/app/weather-worker/main.py"]

