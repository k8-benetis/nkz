// =============================================================================
// Core Entity Tree - Built-in widget for the left panel
// =============================================================================
// Displays the professional asset management grid in the unified viewer.
// This is a "core" widget that's always available, not loaded from a module.

import React, { useCallback } from 'react';
import { AssetManagerGrid } from '@/components/AssetManager';
import { useViewer } from '@/context/ViewerContext';
import { useAuth } from '@/context/KeycloakAuthContext';

interface CoreEntityTreeProps {
    onAddEntity?: () => void;
}

const CoreEntityTree: React.FC<CoreEntityTreeProps> = ({ onAddEntity }) => {
    const { hasAnyRole } = useAuth();
    const { setMapMode } = useViewer();

    const canManageDevices = hasAnyRole(['PlatformAdmin', 'TenantAdmin', 'TechnicalConsultant', 'Farmer']);

    // Handle add entity - either use provided callback or open the entity wizard
    const handleAddEntity = useCallback(() => {
        if (onAddEntity) {
            onAddEntity();
        } else {
            // Default: open draw mode for new entity
            setMapMode('DRAW_GEOMETRY');
        }
    }, [onAddEntity, setMapMode]);

    return (
        <AssetManagerGrid
            onAddEntity={canManageDevices ? handleAddEntity : undefined}
            showCategoryNav={true}
            compact={false}
            className="h-full"
        />
    );
};

export default CoreEntityTree;
