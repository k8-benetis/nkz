
// Placement Machine - State Management for Entity Placement Wizard
// Implements a finite state machine pattern using React useReducer

import { EntityType } from '../components/EntityWizard/entityTypes';

// --- State Definitions ---

export type PlacementMode = 'single' | 'stamp' | 'line' | 'polygon';

export interface PlacementState {
    mode: PlacementMode;
    status: 'idle' | 'active' | 'editing';
    selectedModel: string | null; // URL of the GLB
    selectedIcon: string | null;  // Icon name/URL

    // Single Placement Data
    singleInstance: {
        position: { lat: number; lng: number; height: number } | null;
        rotation: number; // Degrees
        scale: number;
    };

    // Stamp Mode Data
    stampSettings: {
        brushRadius: number; // Meters
        density: number;     // 0-1
        minScale: number;
        maxScale: number;
        randomRotation: boolean;
    };
    stampedInstances: Array<{
        lat: number;
        lng: number;
        height: number;
        scale: number;
        rotation: number;
    }>;

    // Line/Poly Mode (future)
    pathPoints: Array<{ lat: number; lng: number }>;
}

export const INITIAL_STATE: PlacementState = {
    mode: 'single',
    status: 'idle',
    selectedModel: null,
    selectedIcon: null,
    singleInstance: {
        position: null,
        rotation: 0,
        scale: 1
    },
    stampSettings: {
        brushRadius: 15,
        density: 0.5,
        minScale: 0.8,
        maxScale: 1.2,
        randomRotation: true
    },
    stampedInstances: [],
    pathPoints: []
};

// --- Actions ---

export type PlacementAction =
    | { type: 'SET_MODE'; payload: PlacementMode }
    | { type: 'SELECT_MODEL'; payload: string }
    | { type: 'SET_STATUS'; payload: 'idle' | 'active' | 'editing' }

    // Single Mode Actions
    | { type: 'UPDATE_SINGLE_TRANSFORM'; payload: Partial<PlacementState['singleInstance']> }
    | { type: 'SET_SINGLE_POSITION'; payload: { lat: number; lng: number; height?: number } }

    // Stamp Mode Actions
    | { type: 'UPDATE_STAMP_SETTINGS'; payload: Partial<PlacementState['stampSettings']> }
    | { type: 'ADD_STAMPED_INSTANCES'; payload: PlacementState['stampedInstances'] }
    | { type: 'CLEAR_STAMPED_INSTANCES' }
    | { type: 'UNDO_LAST_STAMP' } // Optional complexity

    // Global
    | { type: 'RESET' };

// --- Reducer ---

export function placementReducer(state: PlacementState, action: PlacementAction): PlacementState {
    switch (action.type) {
        case 'SET_MODE':
            return {
                ...state,
                mode: action.payload,
                // Reset transient data when switching modes
                stampedInstances: [],
                singleInstance: { ...state.singleInstance, position: null }
            };

        case 'SELECT_MODEL':
            return {
                ...state,
                selectedModel: action.payload
            };

        case 'SET_STATUS':
            return {
                ...state,
                status: action.payload
            };

        case 'UPDATE_SINGLE_TRANSFORM':
            return {
                ...state,
                singleInstance: {
                    ...state.singleInstance,
                    ...action.payload
                }
            };

        case 'SET_SINGLE_POSITION':
            return {
                ...state,
                singleInstance: {
                    ...state.singleInstance,
                    position: {
                        lat: action.payload.lat,
                        lng: action.payload.lng,
                        height: action.payload.height ?? 0
                    }
                }
            };

        case 'UPDATE_STAMP_SETTINGS':
            return {
                ...state,
                stampSettings: {
                    ...state.stampSettings,
                    ...action.payload
                }
            };

        case 'ADD_STAMPED_INSTANCES':
            return {
                ...state,
                stampedInstances: [
                    ...state.stampedInstances,
                    ...action.payload
                ]
            };

        case 'CLEAR_STAMPED_INSTANCES':
            return {
                ...state,
                stampedInstances: []
            };

        case 'RESET':
            return INITIAL_STATE;

        default:
            return state;
    }
}
