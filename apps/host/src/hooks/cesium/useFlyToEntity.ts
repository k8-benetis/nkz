import { useEffect } from 'react';

/**
 * Handles camera fly-to when a selected entity changes.
 * Each entity type has a type-specific zoom range.
 * Extracted from CesiumMap.tsx fly-to useEffect.
 */
export function useFlyToEntity(
  viewerRef: React.MutableRefObject<any>,
  selectedEntity: any
) {
  useEffect(() => {
    if (!viewerRef.current || !selectedEntity) return;

    // @ts-ignore
    const Cesium = window.Cesium;
    if (!Cesium) return;

    const viewer = viewerRef.current;
    let entityId = '';

    const type = selectedEntity.type || selectedEntity._type;
    let range = 500;

    switch (type) {
      case 'AgriParcel':
      case 'parcel':
        entityId = `parcel-${selectedEntity.id}`;
        range = 1000;
        break;
      case 'AgriculturalRobot':
      case 'robot':
        entityId = `robot-${selectedEntity.id}`;
        range = 50;
        break;
      case 'AgriSensor':
      case 'sensor':
        entityId = `sensor-${selectedEntity.id}`;
        range = 50;
        break;
      case 'Tractor':
      case 'machine':
        entityId = `machine-${selectedEntity.id}`;
        range = 100;
        break;
      case 'LivestockAnimal':
      case 'livestock':
        entityId = `livestock-${selectedEntity.id}`;
        range = 100;
        break;
      case 'WeatherObserved':
      case 'weather':
        entityId = `weather-${selectedEntity.id}`;
        range = 1000;
        break;
      case 'AgriCrop':
      case 'crop':
        entityId = `crop-${selectedEntity.id}`;
        range = 200;
        break;
      case 'AgriBuilding':
      case 'building':
        entityId = `building-${selectedEntity.id}`;
        range = 300;
        break;
      case 'Device':
      case 'device':
        entityId = `device-${selectedEntity.id}`;
        range = 50;
        break;
      default: entityId = selectedEntity.id;
    }

    const entity = viewer.entities.getById(entityId);
    if (entity) {
      console.log(`[CesiumMap] Flying to entity: ${entityId}, range: ${range}`);
      viewer.flyTo(entity, {
        duration: 1.5,
        offset: new Cesium.HeadingPitchRange(0, -Cesium.Math.PI_OVER_FOUR, range)
      });
    } else {
      console.warn(`[CesiumMap] Entity not found: ${entityId}`);
    }
  }, [selectedEntity]);
}
