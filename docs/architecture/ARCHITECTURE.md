# Arquitectura Docker Unificada - Nekazari Platform

## 🏗️ **ARQUITECTURA ACTUAL**

Todos los servicios Python ahora utilizan **Docker containers** para mantener consistencia, escalabilidad y facilidad de mantenimiento.

### ✅ **SERVICIOS DOCKERIZADOS:**

- **API Gateway** - Punto de entrada principal (rate limiting, CORS, JWT)
- **Entity Manager** - Gestión de entidades NGSI-LD
- **Tenant User API** - Gestión multi-tenant y usuarios
- **Email Service** - Servicio de correo electrónico
- **SDM Integration** - Integración con Smart Data Models
- **Tenant Webhook** - Webhooks para creación dinámica de tenants

### 🎯 **BENEFICIOS:**

- **Consistencia** - Mismo patrón de despliegue para todos los servicios
- **Escalabilidad** - Fácil escalado horizontal con Kubernetes
- **Mantenibilidad** - Gestión centralizada de dependencias
- **Portabilidad** - Funciona en cualquier entorno Kubernetes
- **Seguridad** - Aislamiento completo entre servicios

### **📊 Diagrama de Arquitectura**

```
┌─────────────────────────────────────────────────────────────┐
│                    Reverse Proxy Layer                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Traefik    │  │  Frontend   │  │   SSL/TLS   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────┐
│                    Authentication Layer                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │  Keycloak   │  │   Admin     │  │   Auth      │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────┐
│                      APIs Layer                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │API Validator│  │Farmer Auth  │  │Activation   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │API Gateway  │  │Entity Mgr   │  │  Orion-LD   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│  ┌─────────────┐                                            │
│  │  Mosquitto  │                                            │
│  └─────────────┘                                            │
└─────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────┐
│                    Database Layer                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │PostgreSQL   │  │ TimescaleDB │  │  MongoDB    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
└─────────────────────────────────────────────────────────────┘
                                │
┌─────────────────────────────────────────────────────────────┐
│                   Monitoring Layer                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │ Prometheus  │  │   Grafana   │  │Node Exporter│        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│  ┌─────────────┐                                            │
│  │   cAdvisor  │                                            │
│  └─────────────┘                                            │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 **Capas de la Arquitectura**

### **1. 🗄️ Database Layer**
- **PostgreSQL + TimescaleDB**: Base de datos principal
- **MongoDB**: Base de datos para Orion-LD
- **Red**: `nekazari-database`
- **Puertos**: 5432 (PostgreSQL), 27017 (MongoDB)

### **2. 🔐 Authentication Layer**
- **Keycloak**: Gestión de identidades y acceso
- **Red**: `nekazari-auth`
- **Puertos**: 8080 (Keycloak)

### **3. 🔌 APIs Layer**
- **API Validator**: Validación de claves API
- **Farmer Auth API**: Autenticación de agricultores
- **Activation Codes API**: Gestión de códigos de activación
- **API Gateway**: Gateway de APIs
- **Entity Manager**: Gestión de entidades
- **Orion-LD**: Context broker FIWARE
- **Mosquitto**: Broker MQTT
- **Red**: `nekazari-apis`
- **Puertos**: 5010, 5001, 5003, 8000, 5002, 1026, 1883

### **4. 🌐 Reverse Proxy Layer**
- **Traefik**: Ingress controller, SSL/TLS (Let's Encrypt)
- **Frontend**: Aplicación web React
- **SSL/TLS**: Certificados Let's Encrypt
- **Red**: `nekazari-reverse-proxy`
- **Puertos**: 80 (HTTP), 443 (HTTPS), 3001 (Frontend)

### **5. 📊 Monitoring Layer**
- **Prometheus**: Métricas y alertas
- **Grafana**: Dashboards y visualización
- **Node Exporter**: Métricas del sistema
- **cAdvisor**: Métricas de contenedores
- **Red**: `nekazari-monitoring`
- **Puertos**: 9090 (Prometheus), 3000 (Grafana), 9100 (Node Exporter), 8081 (cAdvisor)

## 🚀 **Scripts de Gestión**

### **Deploy por Capas**
```bash
# Deploy completo
sudo ./scripts/layered-deploy.sh all

# Deploy específico
sudo ./scripts/layered-deploy.sh layer database
sudo ./scripts/layered-deploy.sh layer reverse-proxy

# Estado
sudo ./scripts/layered-deploy.sh status

# Rollback
sudo ./scripts/layered-deploy.sh rollback
```

### **Monitoreo de Salud**
```bash
# Verificar capas
sudo ./scripts/health-monitor.sh layers

# Verificar endpoints
sudo ./scripts/health-monitor.sh endpoints

# Monitoreo continuo
sudo ./scripts/health-monitor.sh monitor 60

# Estado detallado
sudo ./scripts/health-monitor.sh status
```

### **Configuración de Redes**
```bash
# Crear redes
sudo ./scripts/configure-networks.sh create

# Listar redes
sudo ./scripts/configure-networks.sh list

# Inspeccionar red
sudo ./scripts/configure-networks.sh inspect nekazari-database
```

## 🛡️ **Ventajas de la Nueva Arquitectura**

### **✅ Alta Disponibilidad**
- **Capas independientes**: Fallo en una capa no afecta otras
- **Health checks**: Monitoreo automático de salud
- **Rollback automático**: Recuperación rápida ante fallos

### **✅ Escalabilidad**
- **Deploy granular**: Actualizar solo lo necesario
- **Redes aisladas**: Comunicación controlada entre capas
- **Recursos optimizados**: Cada capa usa solo lo necesario

### **✅ Mantenibilidad**
- **Configuración modular**: Cada capa en su directorio
- **Scripts automatizados**: Deploy, monitoreo y rollback
- **Documentación clara**: Estructura y funcionamiento documentados

### **✅ Seguridad**
- **Redes aisladas**: Comunicación controlada
- **SSL/TLS**: Comunicación encriptada
- **Health checks**: Detección temprana de problemas

## 🔄 **Flujo de Deploy**

1. **🗄️ Database Layer**: Base de datos y migraciones
2. **🔐 Authentication Layer**: Keycloak y configuración
3. **🔌 APIs Layer**: Microservicios y APIs
4. **🌐 Reverse Proxy Layer**: Nginx y frontend
5. **📊 Monitoring Layer**: Métricas y dashboards

## 🚨 **Procedimientos de Emergencia**

### **Rollback Rápido**
```bash
sudo ./scripts/layered-deploy.sh rollback
```

### **Deploy de Emergencia**
```bash
sudo ./scripts/layered-deploy.sh layer database
sudo ./scripts/layered-deploy.sh layer reverse-proxy
```

### **Monitoreo de Emergencia**
```bash
sudo ./scripts/health-monitor.sh monitor 10
```

## 📋 **Checklist de Deploy**

- [ ] Backup de base de datos
- [ ] Verificar variables de entorno
- [ ] Crear redes Docker
- [ ] Deploy por capas
- [ ] Verificar salud de servicios
- [ ] Probar endpoints externos
- [ ] Documentar cambios

## 🎯 **Próximos Pasos**

1. **Implementar CI/CD**: Pipeline automatizado
2. **Blue-Green Deploy**: Deploy sin downtime
3. **Auto-scaling**: Escalado automático
4. **Backup automático**: Respaldos programados
5. **Alertas**: Notificaciones automáticas
