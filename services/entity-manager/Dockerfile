FROM python:3.11-slim

WORKDIR /app

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    curl \
    wireguard-tools \
    && rm -rf /var/lib/apt/lists/*

# Instalar kubectl with checksum verification
RUN curl -LO "https://dl.k8s.io/release/v1.28.2/bin/linux/amd64/kubectl" && \
    curl -LO "https://dl.k8s.io/release/v1.28.2/bin/linux/amd64/kubectl.sha256" && \
    echo "$(cat kubectl.sha256)  kubectl" | sha256sum --check && \
    chmod +x kubectl && \
    mv kubectl /usr/local/bin/ && \
    rm kubectl.sha256

# Copiar requirements y instalar dependencias Python
COPY services/entity-manager/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar módulos compartidos y cola de tareas
COPY services/common /app/common
COPY services/task-queue /app/task-queue

# Copiar código del servicio
COPY services/entity-manager /app
# Limpiar archivos compilados de Python para evitar usar código antiguo
RUN find /app -type d -name __pycache__ -exec rm -r {} + 2>/dev/null || true && \
    find /app -name "*.pyc" -delete 2>/dev/null || true && \
    find /app -name "*.pyo" -delete 2>/dev/null || true

# Crear enlaces simbólicos para compatibilidad con imports legacy
RUN ln -sf /app/common /common && ln -sf /app/task-queue /task-queue

# Crear usuario no-root
RUN useradd -m -u 1000 apiuser && chown -R apiuser:apiuser /app
USER apiuser

# Exponer puerto
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Comando por defecto
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--threads", "2", "--timeout", "60", "entity_management_api:app"]