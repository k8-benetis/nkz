/**
 * Slot Registration for Nekazari Module
 * Defines all slots that integrate with the Unified Viewer.
 * Run init-module.sh to replace MODULE_SCOPE with your module ID.
 */

import React from 'react';
import { ExampleSlot } from '../components/slots/ExampleSlot';

const MODULE_ID = 'MODULE_SCOPE';

export interface SlotWidgetDefinition {
  id: string;
  moduleId: string;
  component: string;
  priority: number;
  localComponent: React.ComponentType<any>;
  defaultProps?: Record<string, any>;
  showWhen?: {
    entityType?: string[];
    layerActive?: string[];
  };
}

export type SlotType = 'layer-toggle' | 'context-panel' | 'bottom-panel' | 'entity-tree';
export type ModuleViewerSlots = Record<SlotType, SlotWidgetDefinition[]>;

export const moduleSlots: ModuleViewerSlots = {
  'layer-toggle': [],
  'context-panel': [
    {
      id: 'MODULE_SCOPE-example',
      moduleId: MODULE_ID,
      component: 'ExampleSlot',
      priority: 50,
      localComponent: ExampleSlot,
    },
  ],
  'bottom-panel': [],
  'entity-tree': [],
};

export const viewerSlots = moduleSlots;
