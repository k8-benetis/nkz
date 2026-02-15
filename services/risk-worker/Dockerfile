FROM python:3.11-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    postgresql-client \
    gcc \
    musl-dev \
    postgresql-dev

# Copy requirements and install Python dependencies
COPY services/risk-worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy common modules
COPY services/common /app/common
COPY services/task-queue /app/task-queue

# Copy application code
COPY services/risk-worker/*.py /app/
COPY services/risk-worker/risk_models /app/risk_models

# Create compatibility symlinks for legacy imports
RUN ln -sf /app/common /common && ln -sf /app/task-queue /task-queue

# Create non-root user
RUN adduser -D -u 1000 risk && chown -R risk:risk /app
USER risk

CMD ["python", "risk_processor.py"]

