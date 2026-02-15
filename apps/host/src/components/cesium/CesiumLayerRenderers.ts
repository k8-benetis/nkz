// =============================================================================
// Cesium Layer Renderers
// =============================================================================
// Renderer functions for different layer types

import { LayerType, LayerConfig, EntityData, LayerRenderer } from './CesiumLayerConfig';

export const createImageryLayerRenderer = (layerType: LayerType): LayerRenderer => {
  return {
    type: layerType,
    render: (viewer: any, Cesium: any, data: any, config: LayerConfig) => {
      // Imagery layers are handled separately in CesiumMapAdvanced
      // This is a placeholder for future extensibility
    },
  };
};

export const createRobotsLayerRenderer = (): LayerRenderer => {
  return {
    type: 'robots',
    render: (viewer: any, Cesium: any, data: EntityData, config: LayerConfig) => {
      if (!data.robots || data.robots.length === 0) return;

      const getRobotColor = (status?: string): any => {
        switch (status) {
          case 'working':
            return Cesium.Color.GREEN;
          case 'idle':
            return Cesium.Color.YELLOW;
          case 'charging':
            return Cesium.Color.BLUE;
          case 'error':
            return Cesium.Color.RED;
          case 'maintenance':
            return Cesium.Color.ORANGE;
          default:
            return Cesium.Color.WHITE;
        }
      };

      data.robots.forEach((robot) => {
        if (!robot.location?.value?.coordinates) return;
        const [lon, lat] = robot.location.value.coordinates;
        const robotName = typeof robot.name === 'string' ? robot.name : robot.name?.value || 'Robot';
        const robotStatus = typeof robot.status === 'string' ? robot.status : robot.status?.value;

        viewer.entities.add({
          id: `robot-${robot.id}`,
          position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
          name: robotName,
          point: {
            pixelSize: 15,
            color: getRobotColor(robotStatus),
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          label: {
            text: robotName,
            font: '14px sans-serif',
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            pixelOffset: new Cesium.Cartesian2(0, -40),
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          },
          description: `
            <table>
              <tr><td><b>Nombre:</b></td><td>${robotName}</td></tr>
              <tr><td><b>Estado:</b></td><td>${robotStatus || 'N/A'}</td></tr>
              ${robot.batteryLevel ? `<tr><td><b>Batería:</b></td><td>${robot.batteryLevel}%</td></tr>` : ''}
              ${robot.location?.value?.coordinates ? `
                <tr><td><b>Posición:</b></td><td>${lat.toFixed(6)}, ${lon.toFixed(6)}</td></tr>
              ` : ''}
            </table>
          `,
        });
      });
    },
    cleanup: (viewer: any, entities: Map<string, any>) => {
      entities.forEach((entity, id) => {
        if (id.startsWith('robot-')) {
          viewer.entities.remove(entity);
          entities.delete(id);
        }
      });
    },
  };
};

export const createSensorsLayerRenderer = (): LayerRenderer => {
  return {
    type: 'sensors',
    render: (viewer: any, Cesium: any, data: EntityData, config: LayerConfig) => {
      if (!data.sensors || data.sensors.length === 0) return;

      data.sensors.forEach((sensor) => {
        if (!sensor.location?.value?.coordinates) return;
        const [lon, lat] = sensor.location.value.coordinates;
        const sensorName = typeof sensor.name === 'string' ? sensor.name : sensor.name?.value || 'Sensor';

        viewer.entities.add({
          id: `sensor-${sensor.id}`,
          position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
          name: sensorName,
          point: {
            pixelSize: 10,
            color: Cesium.Color.CYAN,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          label: {
            text: sensorName,
            font: '12px sans-serif',
            fillColor: Cesium.Color.CYAN,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 2,
            pixelOffset: new Cesium.Cartesian2(0, -30),
          },
          description: `
            <table>
              <tr><td><b>Nombre:</b></td><td>${sensorName}</td></tr>
              ${sensor.temperature?.value ? `<tr><td><b>Temperatura:</b></td><td>${sensor.temperature.value}°C</td></tr>` : ''}
              ${sensor.moisture?.value ? `<tr><td><b>Humedad:</b></td><td>${sensor.moisture.value}%</td></tr>` : ''}
              ${sensor.ph?.value ? `<tr><td><b>pH:</b></td><td>${sensor.ph.value}</td></tr>` : ''}
              ${sensor.location?.value?.coordinates ? `
                <tr><td><b>Posición:</b></td><td>${lat.toFixed(6)}, ${lon.toFixed(6)}</td></tr>
              ` : ''}
            </table>
          `,
        });
      });
    },
    cleanup: (viewer: any, entities: Map<string, any>) => {
      entities.forEach((entity, id) => {
        if (id.startsWith('sensor-')) {
          viewer.entities.remove(entity);
          entities.delete(id);
        }
      });
    },
  };
};

export const createEntitiesLayerRenderer = (): LayerRenderer => {
  return {
    type: 'entities',
    render: (viewer: any, Cesium: any, data: EntityData, config: LayerConfig) => {
      if (!data.entities || data.entities.length === 0) return;

      data.entities.forEach((entity) => {
        if (!entity.location?.value?.coordinates) return;
        const [lon, lat] = entity.location.value.coordinates;
        const entityName = typeof entity.name === 'string' ? entity.name : entity.name?.value || 'Entidad';
        const entityType = entity.type || 'Unknown';

        viewer.entities.add({
          id: `entity-${entity.id}`,
          position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
          name: entityName,
          point: {
            pixelSize: 8,
            color: Cesium.Color.PURPLE,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          },
          label: {
            text: entityName,
            font: '11px sans-serif',
            fillColor: Cesium.Color.PURPLE,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
            pixelOffset: new Cesium.Cartesian2(0, -25),
          },
          description: `
            <table>
              <tr><td><b>Nombre:</b></td><td>${entityName}</td></tr>
              <tr><td><b>Tipo:</b></td><td>${entityType}</td></tr>
              ${entity.location?.value?.coordinates ? `
                <tr><td><b>Posición:</b></td><td>${lat.toFixed(6)}, ${lon.toFixed(6)}</td></tr>
              ` : ''}
            </table>
          `,
        });
      });
    },
    cleanup: (viewer: any, entities: Map<string, any>) => {
      entities.forEach((entity, id) => {
        if (id.startsWith('entity-')) {
          viewer.entities.remove(entity);
          entities.delete(id);
        }
      });
    },
  };
};

// Registry of all layer renderers
export const LAYER_RENDERERS: Map<LayerType, LayerRenderer> = new Map([
  ['robots', createRobotsLayerRenderer()],
  ['sensors', createSensorsLayerRenderer()],
  ['entities', createEntitiesLayerRenderer()],
]);

