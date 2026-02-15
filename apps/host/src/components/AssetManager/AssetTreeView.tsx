// =============================================================================
// Asset Tree View - Hierarchical View with FIWARE Relationships
// =============================================================================
// Displays assets in a tree structure based on NGSI-LD relationships:
// - AgriFarm → AgriParcel (via refAgriFarm)
// - AgriParcel → AgriCrop, AgriSensor, Device (via refAgriParcel)

import React, { memo, useState, useMemo, useCallback } from 'react';
import {
  ChevronRight,
  ChevronDown,
  MapPin,
  Leaf,
  Gauge,
  TreeDeciduous,
  Building2,
  Droplets,
  Box,
  MoreVertical,
  Plus,
  FolderTree,
} from 'lucide-react';
import { UnifiedAsset, ASSET_TYPE_REGISTRY, CATEGORY_REGISTRY } from '@/types/assets';

// =============================================================================
// Types
// =============================================================================

interface TreeNode {
  asset: UnifiedAsset;
  children: TreeNode[];
  isExpanded: boolean;
  childCount: number;
}

export interface AssetTreeViewProps {
  assets: UnifiedAsset[];
  selectedAssets: Set<string>;
  onToggleSelect: (id: string) => void;
  onAssetClick: (asset: UnifiedAsset) => void;
  onContextMenu: (e: React.MouseEvent, asset: UnifiedAsset) => void;
  onAssignParent?: (asset: UnifiedAsset) => void;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Build tree structure from flat asset list using FIWARE relationships
 */
function buildTree(assets: UnifiedAsset[]): TreeNode[] {
  const nodeMap = new Map<string, TreeNode>();
  const rootNodes: TreeNode[] = [];
  
  // First pass: create all nodes
  assets.forEach(asset => {
    nodeMap.set(asset.id, {
      asset,
      children: [],
      isExpanded: false,
      childCount: 0,
    });
  });
  
  // Second pass: establish parent-child relationships
  assets.forEach(asset => {
    const node = nodeMap.get(asset.id)!;
    const parentId = asset.parentId;
    
    if (parentId && nodeMap.has(parentId)) {
      // Has a valid parent in our dataset
      const parentNode = nodeMap.get(parentId)!;
      parentNode.children.push(node);
      parentNode.childCount++;
    } else {
      // No parent or parent not in dataset = root node
      rootNodes.push(node);
    }
  });
  
  // Sort: Parcels first, then by name
  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.sort((a, b) => {
      // Parcels first
      const aIsParcels = a.asset.category === 'parcels';
      const bIsParcels = b.asset.category === 'parcels';
      if (aIsParcels && !bIsParcels) return -1;
      if (!aIsParcels && bIsParcels) return 1;
      // Then by name
      return a.asset.name.localeCompare(b.asset.name);
    });
  };
  
  // Sort recursively
  const sortRecursive = (nodes: TreeNode[]): TreeNode[] => {
    return sortNodes(nodes).map(node => ({
      ...node,
      children: sortRecursive(node.children),
    }));
  };
  
  return sortRecursive(rootNodes);
}

/**
 * Get icon for asset type
 */
function getAssetIcon(asset: UnifiedAsset): React.ReactNode {
  const typeInfo = ASSET_TYPE_REGISTRY[asset.type];
  const iconClass = "w-4 h-4";
  
  switch (asset.category) {
    case 'parcels':
      return <MapPin className={`${iconClass} text-green-600`} />;
    case 'vegetation':
      return <TreeDeciduous className={`${iconClass} text-emerald-600`} />;
    case 'sensors':
      return <Gauge className={`${iconClass} text-teal-600`} />;
    case 'infrastructure':
      return <Building2 className={`${iconClass} text-slate-600`} />;
    case 'water':
      return <Droplets className={`${iconClass} text-blue-600`} />;
    default:
      return <Box className={`${iconClass} text-slate-500`} />;
  }
}

// =============================================================================
// Tree Node Component
// =============================================================================

interface TreeNodeRowProps {
  node: TreeNode;
  depth: number;
  expandedNodes: Set<string>;
  selectedAssets: Set<string>;
  onToggleExpand: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onAssetClick: (asset: UnifiedAsset) => void;
  onContextMenu: (e: React.MouseEvent, asset: UnifiedAsset) => void;
  onAssignParent?: (asset: UnifiedAsset) => void;
}

const TreeNodeRow: React.FC<TreeNodeRowProps> = memo(({
  node,
  depth,
  expandedNodes,
  selectedAssets,
  onToggleExpand,
  onToggleSelect,
  onAssetClick,
  onContextMenu,
  onAssignParent,
}) => {
  const { asset, children, childCount } = node;
  const isExpanded = expandedNodes.has(asset.id);
  const isSelected = selectedAssets.has(asset.id);
  const hasChildren = children.length > 0;
  const typeInfo = ASSET_TYPE_REGISTRY[asset.type];
  
  // Indent based on depth
  const paddingLeft = 12 + (depth * 20);
  
  return (
    <>
      {/* Node Row */}
      <div
        className={`flex items-center gap-2 py-2 px-2 cursor-pointer transition-colors group ${
          isSelected
            ? 'bg-blue-50 hover:bg-blue-100'
            : 'hover:bg-slate-50'
        }`}
        style={{ paddingLeft }}
        onClick={() => onAssetClick(asset)}
        onContextMenu={(e) => onContextMenu(e, asset)}
      >
        {/* Expand/Collapse Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggleExpand(asset.id);
          }}
          className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-colors ${
            hasChildren 
              ? 'hover:bg-slate-200 text-slate-500' 
              : 'text-transparent'
          }`}
        >
          {hasChildren && (
            isExpanded 
              ? <ChevronDown className="w-4 h-4" />
              : <ChevronRight className="w-4 h-4" />
          )}
        </button>
        
        {/* Icon */}
        <div className="flex-shrink-0">
          {getAssetIcon(asset)}
        </div>
        
        {/* Name & Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-slate-800 truncate">
              {asset.name}
            </span>
            {hasChildren && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                {childCount}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 truncate">
            {typeInfo?.label || asset.type}
            {asset.municipality && ` • ${asset.municipality}`}
          </p>
        </div>
        
        {/* Status Indicator */}
        <div className="flex-shrink-0">
          <span className={`w-2 h-2 rounded-full inline-block ${
            asset.status === 'active' ? 'bg-green-500' :
            asset.status === 'error' ? 'bg-red-500' :
            asset.status === 'maintenance' ? 'bg-amber-500' :
            'bg-slate-300'
          }`} />
        </div>
        
        {/* Actions (visible on hover) */}
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onContextMenu(e, asset);
            }}
            className="p-1 rounded hover:bg-slate-200 text-slate-400"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Children (if expanded) */}
      {isExpanded && children.map(childNode => (
        <TreeNodeRow
          key={childNode.asset.id}
          node={childNode}
          depth={depth + 1}
          expandedNodes={expandedNodes}
          selectedAssets={selectedAssets}
          onToggleExpand={onToggleExpand}
          onToggleSelect={onToggleSelect}
          onAssetClick={onAssetClick}
          onContextMenu={onContextMenu}
          onAssignParent={onAssignParent}
        />
      ))}
    </>
  );
});

TreeNodeRow.displayName = 'TreeNodeRow';

// =============================================================================
// Main Component
// =============================================================================

export const AssetTreeView: React.FC<AssetTreeViewProps> = ({
  assets,
  selectedAssets,
  onToggleSelect,
  onAssetClick,
  onContextMenu,
  onAssignParent,
}) => {
  // State for expanded nodes
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  
  // Build tree structure
  const tree = useMemo(() => buildTree(assets), [assets]);
  
  // Count orphans (assets without parent that aren't parcels)
  const orphanCount = useMemo(() => {
    return tree.filter(node => 
      node.asset.category !== 'parcels' && 
      !node.asset.parentId
    ).length;
  }, [tree]);
  
  // Toggle expand
  const handleToggleExpand = useCallback((id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);
  
  // Expand all
  const handleExpandAll = useCallback(() => {
    const allIds = new Set<string>();
    const collectIds = (nodes: TreeNode[]) => {
      nodes.forEach(node => {
        if (node.children.length > 0) {
          allIds.add(node.asset.id);
          collectIds(node.children);
        }
      });
    };
    collectIds(tree);
    setExpandedNodes(allIds);
  }, [tree]);
  
  // Collapse all
  const handleCollapseAll = useCallback(() => {
    setExpandedNodes(new Set());
  }, []);
  
  return (
    <div className="h-full flex flex-col">
      {/* Tree Header */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <FolderTree className="w-4 h-4" />
          <span>Vista Jerárquica</span>
          {orphanCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px]">
              {orphanCount} sin asignar
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleExpandAll}
            className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100"
          >
            Expandir
          </button>
          <button
            onClick={handleCollapseAll}
            className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100"
          >
            Colapsar
          </button>
        </div>
      </div>
      
      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto">
        {tree.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-slate-400">
            No hay assets para mostrar
          </div>
        ) : (
          <div className="py-1">
            {tree.map(node => (
              <TreeNodeRow
                key={node.asset.id}
                node={node}
                depth={0}
                expandedNodes={expandedNodes}
                selectedAssets={selectedAssets}
                onToggleExpand={handleToggleExpand}
                onToggleSelect={onToggleSelect}
                onAssetClick={onAssetClick}
                onContextMenu={onContextMenu}
                onAssignParent={onAssignParent}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AssetTreeView;

