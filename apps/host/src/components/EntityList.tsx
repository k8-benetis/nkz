import React, { useState, useMemo } from 'react';
import {
    MapPin,
    Bot,
    Gauge,
    Tractor,
    Heart,
    Cloud,
    ChevronRight,
    ChevronDown,
    Building,
    Zap,
    Droplets,
    Activity,
    Layers
} from 'lucide-react';

export interface EntityListItem {
    id: string;
    type: string;
    name: string;
    details?: string;
    status?: string;
    icon?: React.ElementType;
    data?: any;
}

interface EntityListProps {
    entities: EntityListItem[];
    onEntityClick: (entity: EntityListItem) => void;
    selectedId?: string | null;
    isLoading?: boolean;
}

export const EntityList: React.FC<EntityListProps> = ({
    entities,
    onEntityClick,
    selectedId,
    isLoading = false
}) => {
    const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

    const getEntityIcon = (type: string) => {
        switch (type) {
            case 'AgriParcel': return MapPin;
            case 'AgriZone': return Layers;
            case 'AgriCrop': return Droplets;
            case 'AgriculturalRobot': return Bot;
            case 'Tractor': return Tractor;
            case 'AgriSensor': return Gauge;
            case 'Device': return Zap;
            case 'AgriBuilding': return Building;
            case 'LivestockAnimal': return Heart;
            case 'WeatherObserved': return Cloud;
            default: return Activity;
        }
    };

    const getStatusColor = (status?: string) => {
        if (!status) return 'bg-gray-100 text-gray-600';
        switch (status.toLowerCase()) {
            case 'working':
            case 'active':
            case 'online':
                return 'bg-green-100 text-green-600';
            case 'idle':
            case 'standby':
                return 'bg-blue-100 text-blue-600';
            case 'error':
            case 'offline':
            case 'maintenance':
                return 'bg-red-100 text-red-600';
            case 'charging':
                return 'bg-yellow-100 text-yellow-600';
            default:
                return 'bg-gray-100 text-gray-600';
        }
    };

    const toggleParent = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newExpanded = new Set(expandedParents);
        if (newExpanded.has(id)) {
            newExpanded.delete(id);
        } else {
            newExpanded.add(id);
        }
        setExpandedParents(newExpanded);
    };

    // Group entities into hierarchy
    const { parents, childrenMap, others } = useMemo(() => {
        const parents: EntityListItem[] = [];
        const childrenMap: Record<string, EntityListItem[]> = {};
        const others: EntityListItem[] = [];

        entities.forEach(entity => {
            if (entity.type === 'AgriParcel') {
                // Check for refParent (could be in value or direct property depending on normalization)
                const refParent = entity.data?.refParent?.value || entity.data?.refParent;

                if (refParent) {
                    if (!childrenMap[refParent]) childrenMap[refParent] = [];
                    childrenMap[refParent].push(entity);
                } else {
                    parents.push(entity);
                }
            } else {
                others.push(entity);
            }
        });

        return { parents, childrenMap, others };
    }, [entities]);

    const renderEntityItem = (entity: EntityListItem, isChild = false, hasChildren = false, isExpanded = false) => {
        const type = entity.type || 'Unknown';
        const Icon = entity.icon || getEntityIcon(type);
        const isSelected = selectedId === entity.id;

        return (
            <div key={entity.id} className="w-full">
                <div
                    onClick={() => onEntityClick(entity)}
                    className={`w-full p-3 flex items-center gap-3 text-left hover:bg-gray-50 rounded-lg transition border border-gray-100 cursor-pointer group ${isSelected ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500' : ''
                        } ${isChild ? 'ml-6 border-l-2 border-l-gray-300' : ''}`}
                >
                    {hasChildren && (
                        <button
                            onClick={(e) => toggleParent(entity.id, e)}
                            className="p-1 hover:bg-gray-200 rounded text-gray-500"
                        >
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                    )}

                    <div className={`p-2 rounded-lg transition-colors ${isSelected ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'}`}>
                        <Icon className="w-5 h-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                            <p className="font-medium text-gray-900 truncate">{entity.name || 'Sin nombre'}</p>
                            {entity.status && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full uppercase font-bold tracking-wider ${getStatusColor(entity.status)}`}>
                                    {entity.status}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center text-xs text-gray-500 gap-2">
                            <span className="capitalize">{type.replace(/([A-Z])/g, ' $1').trim()}</span>
                            {entity.details && (
                                <>
                                    <span>•</span>
                                    <span className="truncate">{entity.details}</span>
                                </>
                            )}
                        </div>
                    </div>

                    {!hasChildren && (
                        <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isSelected ? 'text-blue-500 translate-x-1' : ''}`} />
                    )}
                </div>
            </div>
        );
    };

    if (isLoading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="animate-pulse flex items-center p-3 border border-gray-100 rounded-lg">
                        <div className="w-10 h-10 bg-gray-200 rounded-lg mr-3"></div>
                        <div className="flex-1 space-y-2">
                            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (entities.length === 0) {
        return (
            <div className="p-8 text-center text-gray-500">
                <p>No se encontraron entidades</p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {/* Render Parcels Hierarchy */}
            {parents.map(parent => {
                const children = childrenMap[parent.id] || [];
                const hasChildren = children.length > 0;
                const isExpanded = expandedParents.has(parent.id);

                return (
                    <div key={parent.id} className="space-y-1">
                        {renderEntityItem(parent, false, hasChildren, isExpanded)}
                        {isExpanded && children.map(child => renderEntityItem(child, true))}
                    </div>
                );
            })}

            {/* Render Other Entities */}
            {others.map(entity => renderEntityItem(entity))}
        </div>
    );
};
