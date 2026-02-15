FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    jq \
    openssl \
    ca-certificates \
    bash \
    && rm -rf /var/lib/apt/lists/*

# Install kubectl with pinned version and checksum verification
RUN KUBECTL_VERSION="v1.28.2" && \
    curl -LO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" && \
    curl -LO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl.sha256" && \
    echo "$(cat kubectl.sha256)  kubectl" | sha256sum --check && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/ && \
    rm kubectl.sha256

# Copy requirements and install Python dependencies
COPY services/tenant-webhook/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY services/tenant-webhook/enhanced-tenant-webhook.py .
COPY services/tenant-webhook/grafana_manager.py .
COPY services/tenant-webhook/expiration_notifier.py .

# Copy common module for keycloak_auth
COPY services/common /app/common

# Copy tenant creation scripts (build context is root, so scripts/ is available)
COPY services/tenant-webhook/scripts/create-tenant.sh /app/scripts/create-tenant.sh
COPY services/tenant-webhook/scripts/create-tenant-ros2.sh /app/scripts/create-tenant-ros2.sh

# Make scripts executable
RUN chmod +x /app/scripts/create-tenant.sh /app/scripts/create-tenant-ros2.sh

# Create non-root user
RUN useradd -m -u 1000 webhook && chown -R webhook:webhook /app
USER webhook

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Run the application
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--timeout", "300", "enhanced-tenant-webhook:app"]
