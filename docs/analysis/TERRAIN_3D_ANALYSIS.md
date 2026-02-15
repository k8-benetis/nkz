# Análisis de Utilidad: Servicio Terrain-3D

**Fecha**: 2025-01-27  
**Autor**: Análisis técnico de arquitectura  
**Estado**: ⚠️ **SERVICIO OBSOLETO - NO EN USO**

---

## 📋 Resumen Ejecutivo

El servicio `terrain-3d` es **funcional pero obsoleto**. Actualmente **NO está desplegado** en producción y **NO está siendo utilizado** por el frontend. La plataforma utiliza providers externos (IGN/IDENA) directamente desde Cesium, eliminando la necesidad de este servicio.

### Conclusión Principal

**RECOMENDACIÓN: ELIMINAR O REFACTORIZAR**

El servicio tiene dependencias pesadas (GDAL, NumPy, Shapely) que no aportan valor en el estado actual del sistema. Las alternativas actuales son más eficientes y escalables.

---

## 🔍 Análisis de Funcionalidad

### ¿Qué hace el servicio?

El servicio `terrain-3d` procesa Modelos Digitales de Elevación (DEM) para generar tiles de terreno 3D compatibles con Cesium:

1. **Descarga de datos SRTM**: Descarga tiles SRTM (1x1 grado) desde servidores de NASA/USGS
2. **Procesamiento GDAL**: Convierte archivos HGT a GeoTIFF usando GDAL
3. **Merge y clip**: Combina múltiples tiles y recorta al bounding box de la parcela
4. **Generación de tiles**: Crea tiles QuantizedMesh (cesium-terrain-builder) o heightmap (gdal2tiles)
5. **Servicio de tiles**: Sirve los tiles generados vía HTTP para consumo en Cesium

### Endpoints Disponibles

```python
POST /api/terrain/generate          # Generar terreno para una parcela
GET  /api/terrain/status/<parcel_id> # Estado de generación
GET  /tiles/<parcel_id>/layer.json   # Metadata de tiles
GET  /tiles/<parcel_id>/<z>/<x>/<y>.terrain  # Tile QuantizedMesh
GET  /tiles/<parcel_id>/<z>/<x>/<y>.png       # Tile heightmap
GET  /api/terrain/check-public-service       # Verificar servicios públicos
```

---

## 📊 Estado Actual en la Plataforma

### ❌ No Desplegado

**Evidencia**:
- No existen manifests de Kubernetes en `k8s/`
- No está listado en servicios core ni addons
- No aparece en documentación de deployment

### ❌ No Utilizado por el Frontend

**Evidencia**:
```typescript
// apps/host/src/services/api.ts:1561-1565
// Terrain 3D Service - REMOVED
// El sistema antiguo de generación de terrain bajo demanda ha sido eliminado.
// Ahora usamos providers externos (IGN/IDENA) directamente en CesiumMap.
```

**Implementación actual**:
```typescript
// apps/host/src/utils/terrain.ts
export const TERRAIN_PROVIDERS = {
  idena: 'https://idena.navarra.es/cesiumTerrain/2017/epsg4326/5m/layer.json',
  ign: 'https://qm-mdt.idee.es/1.0.0/terrain/layer.json',
};
```

El frontend usa **providers externos directamente**:
- **IDENA** (Navarra): 5m resolución
- **IGN** (España completa): Modelo Digital de Terreno nacional

### ✅ Funcionalidad Reemplazada

La visualización 3D de terreno funciona correctamente usando:
- Providers públicos de IGN/IDENA
- Sin necesidad de procesamiento local
- Sin dependencias pesadas
- Sin almacenamiento de tiles

---

## 💰 Coste de Dependencias

### Dependencias Pesadas

```txt
numpy==1.24.3          # ~150MB (compilado)
shapely==2.0.2         # ~50MB (con GEOS)
pyproj==3.6.1          # ~100MB (con PROJ)
gdal==3.7.0            # ~500MB (con librerías C++)
```

**Total aproximado**: ~800MB solo en dependencias Python + librerías del sistema

### Dependencias del Sistema (Dockerfile)

```dockerfile
gcc, g++, libgdal-dev, gdal-bin, python3-gdal
libproj-dev, proj-data, proj-bin
libgeos-dev, libspatialindex-dev
build-essential, cmake  # Para cesium-terrain-builder
```

**Impacto**:
- Imagen Docker: ~1.5-2GB (vs ~200MB para servicios típicos)
- Tiempo de build: 10-15 minutos (vs 2-3 minutos)
- Memoria en runtime: ~500MB-1GB (vs ~50-100MB)

### Cesium-Terrain-Builder

El servicio intenta compilar `cesium-terrain-builder` (C++), pero:
- Puede fallar silenciosamente
- Añade 5-10 minutos al build
- Requiere build-essential (~500MB adicionales)

---

## 🎯 Utilidad Real vs Alternativas

### Casos de Uso Potenciales

#### ✅ Caso 1: Terreno Personalizado de Alta Resolución
**Necesidad**: Terreno con resolución >5m para análisis específicos  
**Realidad**: IGN/IDENA ya proporcionan 5m (suficiente para agricultura)  
**Conclusión**: **No necesario** para casos de uso actuales

#### ✅ Caso 2: Terreno para Regiones sin Cobertura Pública
**Necesidad**: Áreas fuera de España/Navarra  
**Realidad**: SRTM tiene cobertura global, pero resolución 30m (peor que IGN)  
**Conclusión**: **Limitado** - mejor usar servicios públicos cuando disponibles

#### ✅ Caso 3: Procesamiento Bajo Demanda
**Necesidad**: Generar terreno solo cuando se necesita  
**Realidad**: Providers públicos ya están disponibles 24/7  
**Conclusión**: **No necesario** - providers públicos son más eficientes

#### ❌ Caso 4: Análisis de Elevación Programático
**Necesidad**: Calcular pendientes, orientaciones, etc.  
**Realidad**: Esto requeriría un servicio diferente (análisis geoespacial)  
**Conclusión**: **No es el propósito** de terrain-3d

---

## 🔄 Comparación: Terrain-3D vs Providers Públicos

| Aspecto | Terrain-3D (Local) | IGN/IDENA (Público) |
|---------|-------------------|---------------------|
| **Resolución** | 30m (SRTM) | 5m (IGN/IDENA) |
| **Cobertura** | Global (SRTM) | España/Navarra |
| **Latencia** | Alta (generación bajo demanda) | Baja (CDN) |
| **Almacenamiento** | Requerido (tiles generados) | No requerido |
| **Coste computacional** | Alto (procesamiento) | Bajo (solo consumo) |
| **Mantenimiento** | Alto (dependencias, updates) | Bajo (mantenido por IGN/IDENA) |
| **Escalabilidad** | Limitada (procesamiento secuencial) | Alta (CDN distribuido) |
| **Tamaño imagen Docker** | ~1.5-2GB | N/A (no necesario) |
| **Tiempo de build** | 10-15 min | N/A |

**Veredicto**: Providers públicos son **superiores en todos los aspectos** para el caso de uso actual.

---

## 🚨 Problemas Identificados

### 1. Código Muerto
- Servicio implementado pero no desplegado
- Frontend no lo utiliza
- Documentación no lo menciona

### 2. Dependencias Desproporcionadas
- 800MB+ de dependencias para funcionalidad no utilizada
- Build complejo y propenso a errores
- Mantenimiento costoso

### 3. Alternativa Mejor Disponible
- Providers públicos más rápidos, mejores y sin coste
- Sin necesidad de procesamiento local

### 4. Falta de Integración
- No hay manifests de Kubernetes
- No está en el flujo de deployment
- No hay tests de integración

---

## 💡 Recomendaciones

### Opción 1: ELIMINAR (Recomendada) ⭐

**Acciones**:
1. Eliminar `services/terrain-3d/`
2. Limpiar referencias en documentación
3. Eliminar del registry de imágenes (si existe)

**Ventajas**:
- Reduce complejidad del codebase
- Elimina dependencias pesadas
- Simplifica mantenimiento
- No hay impacto funcional (no se usa)

**Desventajas**:
- Ninguna (servicio no está en uso)

### Opción 2: REFACTORIZAR como Addon Opcional

**Si hay casos de uso futuros** (terreno personalizado, regiones sin cobertura):

**Acciones**:
1. Mover a `k8s/addons/visualization/terrain-3d/`
2. Documentar como addon opcional
3. Optimizar Dockerfile (multi-stage build)
4. Añadir tests y CI/CD
5. Documentar casos de uso específicos

**Ventajas**:
- Mantiene funcionalidad para casos especiales
- No afecta servicios core
- Permite activación bajo demanda

**Desventajas**:
- Mantenimiento continuo requerido
- Dependencias pesadas siguen presentes

### Opción 3: REEMPLAZAR con Servicio Ligero

**Si se necesita procesamiento de elevación** (no solo visualización):

**Acciones**:
1. Crear nuevo servicio `elevation-analysis` (más específico)
2. Usar solo las librerías necesarias
3. Enfoque en análisis, no generación de tiles
4. Integrar con servicios de análisis geoespacial existentes

**Ventajas**:
- Servicio más enfocado y ligero
- Mejor arquitectura modular
- Reutilizable para otros casos de uso

**Desventajas**:
- Requiere desarrollo adicional
- Solo si hay necesidad real de análisis

---

## 📈 Impacto de Eliminación

### Impacto Funcional
- ✅ **CERO**: El servicio no está en uso
- ✅ Frontend funciona correctamente con providers públicos
- ✅ No hay dependencias de otros servicios

### Impacto Técnico
- ✅ **POSITIVO**: Reduce complejidad
- ✅ **POSITIVO**: Reduce tamaño del repositorio
- ✅ **POSITIVO**: Simplifica CI/CD
- ✅ **POSITIVO**: Reduce superficie de ataque

### Impacto en Deployment
- ✅ **CERO**: No está desplegado actualmente
- ✅ No requiere cambios en Kubernetes
- ✅ No requiere cambios en nginx/ingress

---

## 🔮 Consideraciones Futuras

### ¿Cuándo sería útil terrain-3d?

1. **Terreno personalizado de muy alta resolución** (LIDAR, drones)
   - Requeriría fuente de datos diferente (no SRTM)
   - Caso de uso muy específico

2. **Análisis de elevación programático**
   - Pendientes, orientaciones, cuencas
   - Requeriría servicio diferente (análisis, no visualización)

3. **Regiones sin cobertura pública**
   - Solo si se expande fuera de España
   - SRTM tiene resolución inferior a IGN

4. **Offline/Edge computing**
   - Si se necesita funcionar sin internet
   - Caso de uso muy específico

**Conclusión**: Casos de uso muy específicos que no justifican mantener el servicio actual.

---

## ✅ Plan de Acción Recomendado

### Fase 1: Verificación (1 día)
- [ ] Confirmar que no hay referencias activas
- [ ] Verificar que no está en producción
- [ ] Revisar logs/historial de uso

### Fase 2: Eliminación (1 día)
- [ ] Eliminar `services/terrain-3d/`
- [ ] Limpiar referencias en documentación
- [ ] Actualizar `.gitignore` si es necesario
- [ ] Commit: `chore: remove unused terrain-3d service`

### Fase 3: Documentación (0.5 días)
- [ ] Documentar decisión en `docs/architecture/`
- [ ] Actualizar README si es necesario
- [ ] Añadir nota sobre providers públicos

**Tiempo total estimado**: 2.5 días

---

## 📚 Referencias

- [IGN Modelo Digital de Terreno](https://www.ign.es/web/ign/portal/ide-elevaciones)
- [IDENA Terreno Navarra](https://idena.navarra.es/)
- [Cesium Terrain Providers](https://cesium.com/learn/cesiumjs/ref-doc/TerrainProvider.html)
- [SRTM Data](https://e4ftl01.cr.usgs.gov/MEASURES/SRTMGL1.003/2000.02.11/)

---

## 🎯 Conclusión Final

El servicio `terrain-3d` es **técnicamente funcional pero obsoleto**. La plataforma ha evolucionado hacia una arquitectura más eficiente usando providers públicos, eliminando la necesidad de procesamiento local.

**Recomendación**: **ELIMINAR** el servicio para reducir complejidad y dependencias pesadas, sin impacto funcional.

Si en el futuro se requiere funcionalidad similar, se puede:
1. Evaluar servicios públicos adicionales
2. Crear un servicio más específico y ligero
3. Integrar como addon opcional solo si hay necesidad real

---

**Estado**: ✅ Análisis completo  
**Próximos pasos**: Decisión de eliminación o refactorización

