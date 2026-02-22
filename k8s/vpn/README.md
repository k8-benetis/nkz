# Infraestructura VPN/SDN — Guía Operativa

Headscale como plano de control WireGuard/Tailscale para Nekazari.
Esta infraestructura es **core** — siempre activa, no es un módulo marketplace.

## Orden de despliegue

```
01-ca-clusterissuer.yaml  → ClusterIssuer PKI IoT
02-headscale-config.yaml  → ConfigMap configuración + ACLs
03-headscale-deployment.yaml → Deployment + Services + Ingress
```

---

## Paso 0 — Pre-requisitos en el servidor

### Abrir puertos en UFW

```bash
sudo ufw allow 51820/udp   # WireGuard data plane (conexiones directas)
sudo ufw allow 3478/udp    # STUN (NAT traversal para 4G/5G con CG-NAT)
sudo ufw status            # Verificar: 22, 80, 443, 51820/udp, 3478/udp
```

### Instalar Tailscale en el nodo K8s (subnet router)

```bash
# En el servidor de producción (109.123.252.120)
curl -fsSL https://tailscale.com/install.sh | sh

# Autenticar contra Headscale (después de que Headscale esté desplegado)
# Obtener pre-auth key desde Headscale:
#   kubectl exec -n nekazari deploy/headscale -- headscale preauthkeys create \
#     --user cluster-router --expiration 1h --reusable
tailscale up \
  --login-server=https://vpn.nkz.robotika.cloud \
  --authkey=<PRE_AUTH_KEY> \
  --advertise-routes=10.43.0.0/16 \
  --accept-routes \
  --hostname=k8s-cluster-router

# Aprobar la ruta en Headscale
kubectl exec -n nekazari deploy/headscale -- \
  headscale routes list
kubectl exec -n nekazari deploy/headscale -- \
  headscale routes enable --route <ROUTE_ID>
```

---

## Paso 1 — Generar CA IoT privada

La CA firma certificados para: Zenoh TLS (robots) y MQTT mTLS (ESP32).
**Ejecutar en máquina segura, NUNCA en el servidor de producción.**

```bash
# 1. Generar clave privada CA (4096-bit RSA, 10 años de validez)
openssl genrsa -out iot-ca.key 4096

# 2. Generar certificado CA auto-firmado
openssl req -new -x509 -key iot-ca.key -sha256 -days 3650 \
  -out iot-ca.crt \
  -subj "/C=ES/O=Nekazari/CN=Nekazari IoT CA"

# 3. Crear el Secret en cert-manager namespace
kubectl create secret tls nekazari-iot-ca-secret \
  --cert=iot-ca.crt \
  --key=iot-ca.key \
  -n cert-manager

# 4. Guardar iot-ca.crt (la clave pública) — necesaria para ESP32 factory tool
#    NUNCA commitear iot-ca.key

# 5. Aplicar ClusterIssuer (después de crear el Secret)
kubectl apply -f k8s/vpn/01-ca-clusterissuer.yaml
```

---

## Paso 2 — Preparar PostgreSQL para Headscale

```bash
# Port-forward a PostgreSQL
sudo kubectl port-forward -n nekazari svc/timescaledb-service 5432:5432 &

# Crear base de datos y usuario
psql -h localhost -U postgres -c "CREATE DATABASE headscale;"
psql -h localhost -U postgres -c \
  "CREATE USER headscale WITH PASSWORD '<STRONG_PASSWORD>';"
psql -h localhost -U postgres -c \
  "GRANT ALL PRIVILEGES ON DATABASE headscale TO headscale;"

kill %1
```

---

## Paso 3 — Crear Secrets y desplegar Headscale

```bash
# Secret con la contraseña de BD (la misma que usaste en el paso anterior)
kubectl create secret generic headscale-db-secret \
  --from-literal=db-password="<STRONG_PASSWORD>" \
  -n nekazari

# Aplicar ConfigMap y Deployment
kubectl apply -f k8s/vpn/02-headscale-config.yaml
kubectl apply -f k8s/vpn/03-headscale-deployment.yaml

# Verificar
kubectl rollout status deployment/headscale -n nekazari
kubectl logs -n nekazari deployment/headscale --tail=50
```

---

## Paso 4 — Crear user inicial en Headscale

```bash
# El subnet router del cluster necesita su propio user en Headscale
kubectl exec -n nekazari deploy/headscale -- \
  headscale users create cluster-router

# Verificar estado
kubectl exec -n nekazari deploy/headscale -- headscale nodes list
```

---

## Gestión habitual

```bash
# Ver todos los peers conectados
kubectl exec -n nekazari deploy/headscale -- headscale nodes list

# Crear Pre-Auth Key para un tenant (el nkz-network-controller lo hace automáticamente)
kubectl exec -n nekazari deploy/headscale -- \
  headscale preauthkeys create --user <tenant_id> --expiration 5m

# Ver Pre-Auth Keys de un tenant
kubectl exec -n nekazari deploy/headscale -- \
  headscale preauthkeys list --user <tenant_id>

# Revocar un peer (dispositivo perdido o comprometido)
kubectl exec -n nekazari deploy/headscale -- \
  headscale nodes delete --identifier <NODE_ID>

# Ver rutas anunciadas
kubectl exec -n nekazari deploy/headscale -- headscale routes list
```

---

## Seguridad

- La clave privada CA (`iot-ca.key`) NUNCA se sube a git ni al servidor.
  Guardarla en un gestor de secretos offline (KeePass, 1Password, etc.).
- El Secret `headscale-db-secret` se crea manualmente, nunca en git.
- Los certificados de dispositivos caducan en 1 año — renovar vía factory tool o endpoint de renovación del nkz-network-controller.
- Revocar inmediatamente cualquier nodo comprometido con `headscale nodes delete`.
