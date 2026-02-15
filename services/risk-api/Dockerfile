FROM python:3.11-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    postgresql-client \
    gcc \
    musl-dev \
    postgresql-dev

# Copy requirements and install Python dependencies
COPY services/risk-api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy common modules
COPY services/common /app/common

# Copy application code
COPY services/risk-api/*.py /app/

# Create compatibility symlinks
RUN ln -sf /app/common /common

# Create non-root user
RUN adduser -D -u 1000 risk && chown -R risk:risk /app
USER risk

EXPOSE 5000

CMD ["python", "risk_api.py"]

