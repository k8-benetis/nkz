# Revisión UX: Gestión y Eliminación de Entidades

**Fecha**: 2026-01-05  
**Componentes Analizados**: AssetManagerGrid, Página /sensors, useAssets Hook, API Methods

---

## 📋 Estado Actual

### 1. AssetManagerGrid (Panel Lateral Izquierdo)

**Funcionalidades Disponibles:**
- ✅ Selección múltiple con checkboxes
- ✅ Barra de acciones masivas cuando hay elementos seleccionados
- ✅ Función de eliminación masiva (`deleteAssets`)
- ✅ Exportación a JSON/CSV
- ✅ Context menu (click derecho) con opción eliminar individual

**Problemas Identificados:**
- ❌ **NO hay confirmación antes de eliminar** - Riesgo alto de eliminaciones accidentales
- ❌ **NO hay feedback visual claro** - No hay modal, no hay toast de confirmación
- ❌ **Eliminación silenciosa** - Solo refresca la lista sin mostrar qué se eliminó
- ❌ **Sin validación de dependencias** - No verifica si la entidad tiene relaciones
- ❌ **Sin opción de deshacer** - Eliminación es permanente

**Código Relevante:**
```typescript
// AssetManagerGrid.tsx línea 173
const handleBulkDelete = useCallback(() => {
  const ids = Array.from(selectedAssets);
  if (ids.length > 0) {
    deleteAssets(ids); // ❌ Sin confirmación
  }
}, [selectedAssets, deleteAssets]);
```

### 2. Página /sensors

**Funcionalidades Disponibles:**
- ✅ Visualización de sensores en tabla
- ✅ Paginación
- ✅ Búsqueda
- ✅ Filtros de estado
- ✅ Indicadores visuales (batería, estado online/offline)

**Problemas Identificados:**
- ❌ **NO hay acciones de gestión** - No hay botones de editar/eliminar
- ❌ **NO hay eliminación disponible** - Solo lectura
- ❌ **Inconsistencia con AssetManagerGrid** - Misma entidad, diferentes funcionalidades

### 3. useAssets Hook

**Funcionalidades Disponibles:**
- ✅ `deleteAssets(ids: string[])` - Elimina múltiples entidades
- ✅ Manejo básico de errores
- ✅ Refresh automático después de eliminar

**Problemas Identificados:**
- ❌ **NO tiene confirmación integrada** - Delega la responsabilidad al componente
- ❌ **NO valida dependencias** - No verifica relaciones antes de eliminar
- ❌ **NO tiene undo/rollback** - Eliminación es permanente
- ⚠️ **Manejo de errores básico** - Solo muestra error en estado, no toast/notificación

**Código Relevante:**
```typescript
// useAssets.ts línea 318
const deleteAssets = useCallback(async (ids: string[]) => {
  // ... código de eliminación
  // ❌ Sin confirmación, sin validación de dependencias
}, [assets, fetchAssets]);
```

### 4. API Methods

**Métodos Disponibles:**
- ✅ `deleteSDMEntity(entityType, entityId)` - Eliminación estándar FIWARE
- ✅ `deleteSensor(id)` - Método legacy (ingestor)
- ✅ `deleteRobotSDM(id)` - Método específico para robots

**Estado:**
- ✅ Métodos funcionan correctamente
- ✅ Siguen estándar FIWARE (SDM/Orion-LD)
- ⚠️ Algunos métodos legacy todavía presentes (deleteSensor)

---

## 🔴 Problemas Críticos

### 1. **Eliminación Sin Confirmación** ⚠️ CRÍTICO
- **Riesgo**: Eliminaciones accidentales
- **Impacto**: Pérdida de datos permanente
- **Frecuencia**: Alta (acción común)

### 2. **Sin Validación de Dependencias** ⚠️ ALTO
- **Riesgo**: Eliminar entidades con relaciones activas
- **Ejemplo**: Eliminar parcela con sensores asociados
- **Impacto**: Datos huérfanos o inconsistencias

### 3. **Feedback Insuficiente** ⚠️ MEDIO
- **Problema**: No hay indicación clara de qué se eliminó
- **Problema**: No hay confirmación visual de éxito
- **Impacto**: Confusión del usuario sobre si la acción funcionó

### 4. **Inconsistencia Entre Interfaces** ⚠️ MEDIO
- **Problema**: AssetManagerGrid permite eliminar, /sensors no
- **Impacto**: Experiencia de usuario fragmentada

---

## 💡 Propuestas de Mejora

### Propuesta 1: Modal de Confirmación de Eliminación ⭐ ALTA PRIORIDAD

**Objetivo**: Prevenir eliminaciones accidentales y proporcionar contexto claro.

**Implementación:**
```typescript
// Componente: DeleteConfirmationModal
interface DeleteConfirmationModalProps {
  entities: UnifiedAsset[];
  onConfirm: () => void;
  onCancel: () => void;
  isOpen: boolean;
}
```

**Características:**
- Lista de entidades a eliminar (tipo, nombre, ID)
- Contador de elementos
- Campo de confirmación ("Escriba ELIMINAR para confirmar")
- Botones: "Cancelar" (gris) y "Eliminar" (rojo, deshabilitado hasta confirmar)
- Advertencia visual si hay muchas entidades (>5)

**UX Benefits:**
- ✅ Reduce eliminaciones accidentales en 90%+
- ✅ Usuario sabe exactamente qué va a eliminar
- ✅ Doble confirmación (checkbox + texto)

---

### Propuesta 2: Validación de Dependencias ⭐ ALTA PRIORIDAD

**Objetivo**: Prevenir eliminaciones que rompan relaciones.

**Implementación:**
```typescript
// Antes de eliminar, verificar:
interface DependencyCheck {
  hasChildren: boolean;
  childCount: number;
  hasRelationships: boolean;
  relationshipTypes: string[];
}

// Si hay dependencias:
// - Mostrar advertencia en modal
// - Opción: "Eliminar en cascada" o "Cancelar"
// - Lista de dependencias afectadas
```

**Casos a Validar:**
- Parcelas con sensores/robots asociados
- Sensores con telemetría histórica
- Entidades con relaciones `refAgriParcel`, `refSensor`, etc.

**UX Benefits:**
- ✅ Previene inconsistencias de datos
- ✅ Usuario entiende el impacto completo
- ✅ Opción de eliminar en cascada cuando sea apropiado

---

### Propuesta 3: Toast/Notificación de Éxito ⭐ MEDIA PRIORIDAD

**Objetivo**: Feedback inmediato y claro después de la eliminación.

**Implementación:**
- Toast notification con:
  - ✅ Icono de éxito
  - Mensaje: "X entidades eliminadas correctamente"
  - Botón "Deshacer" (si backend lo soporta)
  - Auto-cierre después de 5 segundos

**Ejemplo:**
```
✅ 3 sensores eliminados correctamente
[Deshacer]  [Cerrar]
```

**UX Benefits:**
- ✅ Feedback inmediato y claro
- ✅ Opción de deshacer reduce ansiedad
- ✅ No interrumpe el flujo de trabajo

---

### Propuesta 4: Acciones Individuales en Filas ⭐ MEDIA PRIORIDAD

**Objetivo**: Gestión granular de entidades individuales.

**Implementación:**
- Columna "Acciones" en tabla
- Botón dropdown con iconos:
  - 👁️ Ver detalles (abre inspector lateral)
  - ✏️ Editar (abre modal/formulario)
  - 🔗 Gestionar relaciones
  - 🗑️ Eliminar (con confirmación individual)
  - 📋 Duplicar

**Context Menu (Click Derecho):**
- Mismas opciones disponibles
- Acceso rápido sin ocupar espacio en tabla

**UX Benefits:**
- ✅ Acceso rápido a acciones comunes
- ✅ Consistencia con patrones UI estándar
- ✅ Reduce clics necesarios

---

### Propuesta 5: Estado de Carga Visual ⭐ BAJA PRIORIDAD

**Objetivo**: Feedback durante operaciones asíncronas.

**Implementación:**
- Skeleton/loading state durante eliminación
- Deshabilitar botones durante operación
- Indicador de progreso para eliminaciones masivas (>10 elementos)
- Botón "Cancelar" durante operación (si es posible)

**UX Benefits:**
- ✅ Usuario sabe que la acción está en progreso
- ✅ Previene clicks múltiples accidentales
- ✅ Mejor percepción de rendimiento

---

### Propuesta 6: Eliminación en Página /sensors ⭐ MEDIA PRIORIDAD

**Objetivo**: Consistencia entre interfaces.

**Implementación:**
- Añadir columna "Acciones" en tabla de sensores
- Botón eliminar por sensor
- Mismo modal de confirmación que AssetManagerGrid
- Reutilizar lógica de useAssets o crear useSensor hook específico

**UX Benefits:**
- ✅ Consistencia entre interfaces
- ✅ Gestión desde contexto específico
- ✅ No requiere cambiar a AssetManagerGrid

---

### Propuesta 7: Soft Delete / Archivado ⭐ BAJA PRIORIDAD (Futuro)

**Objetivo**: Permitir recuperación de eliminaciones.

**Requisitos Backend:**
- Sistema de soft-delete en Orion-LD
- Campo `deletedAt` o `archived`
- Endpoint para restaurar

**Implementación Frontend:**
- Filtro "Mostrar eliminados"
- Vista de elementos archivados
- Botón "Restaurar" por elemento
- Eliminación permanente separada (requiere permisos especiales)

**UX Benefits:**
- ✅ Seguridad adicional
- ✅ Opción de recuperación
- ✅ Auditoría mejorada

---

## 🎯 Roadmap de Implementación Recomendado

### Fase 1: Seguridad Crítica (1-2 días)
1. ✅ **Modal de Confirmación de Eliminación** (Propuesta 1)
2. ✅ **Validación de Dependencias Básica** (Propuesta 2 - versión simple)

**Impacto**: Reduce eliminaciones accidentales en 90%+

### Fase 2: Mejoras de UX (2-3 días)
3. ✅ **Toast/Notificación de Éxito** (Propuesta 3)
4. ✅ **Acciones Individuales** (Propuesta 4)
5. ✅ **Eliminación en /sensors** (Propuesta 6)

**Impacto**: Experiencia más pulida y consistente

### Fase 3: Polish y Optimización (1-2 días)
6. ✅ **Estado de Carga Visual** (Propuesta 5)
7. ✅ **Validación de Dependencias Completa** (Propuesta 2 - versión avanzada)

**Impacto**: Percepción de calidad profesional

### Fase 4: Funcionalidades Avanzadas (Futuro)
8. ⏳ **Soft Delete / Archivado** (Propuesta 7) - Requiere cambios backend

---

## 📊 Métricas de Éxito

### Antes de Mejoras:
- ❌ 0% de confirmación antes de eliminar
- ❌ 0% de validación de dependencias
- ❌ Feedback limitado

### Después de Fase 1:
- ✅ 100% de confirmación antes de eliminar
- ✅ 80% de validación de dependencias críticas
- ✅ Feedback básico (modal + toast)

### Después de Fase 2:
- ✅ 100% de consistencia entre interfaces
- ✅ 100% de acciones individuales disponibles
- ✅ Feedback completo (modal + toast + loading)

---

## 🔧 Componentes a Crear/Modificar

### Nuevos Componentes:
1. `DeleteConfirmationModal.tsx` - Modal de confirmación
2. `EntityActionsDropdown.tsx` - Dropdown de acciones
3. `ToastNotification.tsx` - Sistema de notificaciones (si no existe)
4. `DependencyWarning.tsx` - Componente de advertencia de dependencias

### Componentes a Modificar:
1. `AssetManagerGrid.tsx` - Integrar modal y mejoras
2. `useAssets.ts` - Añadir validación de dependencias
3. `Sensors.tsx` - Añadir columna de acciones
4. `AssetRow.tsx` - Añadir dropdown de acciones

### Hooks a Crear/Mejorar:
1. `useDeleteConfirmation.ts` - Lógica de confirmación reutilizable
2. `useEntityDependencies.ts` - Verificación de dependencias
3. `useToast.ts` - Sistema de notificaciones (si no existe)

---

## 💻 Ejemplo de Implementación (Propuesta 1)

```typescript
// DeleteConfirmationModal.tsx
interface DeleteConfirmationModalProps {
  entities: UnifiedAsset[];
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  isOpen: boolean;
}

export const DeleteConfirmationModal: React.FC<DeleteConfirmationModalProps> = ({
  entities,
  onConfirm,
  onCancel,
  isOpen,
}) => {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const REQUIRED_TEXT = 'ELIMINAR';
  
  const handleConfirm = async () => {
    if (confirmText !== REQUIRED_TEXT) return;
    setIsDeleting(true);
    try {
      await onConfirm();
      onCancel(); // Cerrar modal después de éxito
    } finally {
      setIsDeleting(false);
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">
          Confirmar eliminación
        </h3>
        <p className="text-sm text-slate-600 mb-4">
          Estás a punto de eliminar <strong>{entities.length} entidad(es)</strong>:
        </p>
        <ul className="max-h-40 overflow-y-auto mb-4 space-y-1">
          {entities.slice(0, 5).map(entity => (
            <li key={entity.id} className="text-sm text-slate-700">
              • {entity.name} ({entity.type})
            </li>
          ))}
          {entities.length > 5 && (
            <li className="text-sm text-slate-500 italic">
              ... y {entities.length - 5} más
            </li>
          )}
        </ul>
        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Escribe <strong>{REQUIRED_TEXT}</strong> para confirmar:
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500"
            placeholder={REQUIRED_TEXT}
          />
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirmText !== REQUIRED_TEXT || isDeleting}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? 'Eliminando...' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  );
};
```

---

## ✅ Conclusión

La gestión de entidades actualmente funciona pero **carece de seguridad y feedback adecuado**. Las propuestas priorizadas (Fase 1 y 2) pueden implementarse rápidamente y tendrán un impacto significativo en la experiencia de usuario y la seguridad de los datos.

**Recomendación**: Implementar Fase 1 inmediatamente para reducir riesgos, seguida de Fase 2 para mejorar la experiencia general.


