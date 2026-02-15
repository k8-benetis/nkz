FROM python:3.11-slim

WORKDIR /app

# Instalar dependencias del sistema
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copiar requirements y instalar dependencias Python
COPY services/sdm-integration/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar directorio common (necesario para imports)
COPY services/common /app/common

# Copiar código de la aplicación
COPY services/sdm-integration/ .

# Crear usuario no-root
RUN useradd -m -u 1000 apiuser && chown -R apiuser:apiuser /app
USER apiuser

# Exponer puerto
EXPOSE 5000

# Ensure Python output is not buffered (for logging)
ENV PYTHONUNBUFFERED=1

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Comando por defecto con logging habilitado
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--threads", "2", "--timeout", "60", "--access-logfile", "-", "--error-logfile", "-", "--capture-output", "--log-level", "debug", "sdm_api:app"]
# Trigger rebuild 1767353307
