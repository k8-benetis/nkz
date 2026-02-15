FROM python:3.11-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    gcc \
    musl-dev

# Copy requirements and install Python dependencies
COPY services/risk-orchestrator/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy common modules
COPY services/task-queue /app/task-queue

# Copy application code
COPY services/risk-orchestrator/*.py /app/

# Create compatibility symlinks
RUN ln -sf /app/task-queue /task-queue

# Create non-root user
RUN adduser -D -u 1000 orchestrator && chown -R orchestrator:orchestrator /app
USER orchestrator

CMD ["python", "risk_orchestrator.py"]

