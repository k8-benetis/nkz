/**
 * Slot definitions — declare which host slots this module occupies.
 *
 * Available slots:
 *   map-layer      — overlay or toolbar button on the 3D map
 *   layer-toggle   — toggle entry in the layer panel
 *   context-panel  — side panel shown when an entity is selected
 *   bottom-panel   — tabbed panel at the bottom of the viewer
 *   entity-tree    — context menu entry in the entity tree
 *   dashboard-widget — card in the tenant dashboard
 */
import type { ModuleViewerSlots } from '@nekazari/sdk';
import { ExampleSlot } from '../components/slots/ExampleSlot';

const MODULE_ID = 'MODULE_NAME';

export const moduleSlots: ModuleViewerSlots = {
  'map-layer': [],
  'layer-toggle': [],
  'context-panel': [
    {
      id: 'MODULE_NAME-context',
      moduleId: MODULE_ID,
      component: 'ExampleSlot',
      localComponent: ExampleSlot,
      priority: 10,
    },
  ],
  'bottom-panel': [],
  'entity-tree': [],
  'dashboard-widget': [],
};
