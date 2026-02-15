# =============================================================================
# MQTT Credentials Manager Dockerfile
# =============================================================================

FROM python:3.11-slim

WORKDIR /app

# Install mosquitto_passwd for password hashing
RUN apt-get update && apt-get install -y \
    mosquitto-clients \
    kubectl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY services/mqtt-credentials-manager/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY services/mqtt-credentials-manager/mqtt_credentials_manager.py .

# Create non-root user
RUN useradd -m -u 1000 mqttmgr && chown -R mqttmgr:mqttmgr /app
USER mqttmgr

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "30", "--access-logfile", "-", "--error-logfile", "-", "mqtt_credentials_manager:app"]

