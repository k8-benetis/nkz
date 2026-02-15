# Ornito-Radar Module

## Descripción

Ornito-Radar es un módulo remoto (micro-frontend) para la plataforma Nekazari que ayuda a los agricultores a identificar aves beneficiosas para el control biológico de plagas. El módulo proporciona información sobre aves que actúan como depredadores naturales de insectos y roedores perjudiciales para los cultivos.

## Características

- **Identificación de Aves**: Base de datos de aves beneficiosas con información ecológica
- **Reproducción de Audios**: Integración con Xeno-canto para escuchar cantos de aves
- **Información Ecológica**: Detalles sobre función ecológica y plagas que controlan
- **Interfaz Intuitiva**: Tarjetas visuales con imágenes y descripciones

## Arquitectura

Este módulo utiliza **Module Federation** para ser cargado dinámicamente por el Host de Nekazari:

- **Scope**: `ornito_module`
- **Exposed Module**: `./OrnitoApp`
- **Remote Entry**: Se carga desde Vercel (URL configurada en `marketplace_modules`)

## Desarrollo Local

```bash
# Instalar dependencias (desde raíz del monorepo)
pnpm install

# Ejecutar en modo desarrollo
cd apps/ornito-radar
pnpm dev

# El módulo estará disponible en http://localhost:5003
```

## Build

```bash
# Build del módulo
pnpm build

# El output estará en apps/ornito-radar/dist
# El archivo remoteEntry.js estará en dist/assets/
```

## Despliegue

1. **Vercel**: Conectar el repositorio y configurar:
   - Root Directory: `apps/ornito-radar`
   - Framework: Vite
   - Build Command: `cd ../.. && pnpm install --frozen-lockfile && cd apps/ornito-radar && vite build`
   - Output Directory: `dist`

2. **Registro en Base de Datos**: Ejecutar `scripts/seeds/register_ornito_module.sql`
   - Actualizar `remote_entry_url` con la URL real de Vercel después del despliegue

## Dependencias Compartidas

El módulo comparte las siguientes dependencias con el Host (singleton):
- `react` ^18.3.1
- `react-dom` ^18.3.1
- `react-router-dom` ^6.26.0
- `@nekazari/sdk` (workspace)
- `@nekazari/ui-kit` (workspace)
- `i18next`
- `react-i18next`

## Uso del SDK

El módulo utiliza el SDK de Nekazari para:
- **i18n**: `useTranslation` del SDK (no instala su propia instancia)
- **UI Components**: `Button`, `Card` del UI-Kit
- **Auth**: Puede usar `useAuth` del SDK si necesita acceso a autenticación

## Estructura de Datos

Las aves se definen en `src/data/birds.ts` con:
- Información básica (nombre común, científico)
- Función ecológica
- Plagas objetivo
- Referencias a Xeno-canto para audios
- URLs de imágenes

## Mejoras Futuras

- [ ] Integración real con API de Xeno-canto
- [ ] Sistema de identificación por foto (ML)
- [ ] Mapa de distribución de aves
- [ ] Recomendaciones de hábitats para atraer aves
- [ ] Registro de avistamientos por el agricultor
