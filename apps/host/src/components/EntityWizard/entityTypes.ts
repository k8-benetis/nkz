
import React from 'react';

export interface EntityTypeInfo {
    keywords: string[];
    macroCategory: 'assets' | 'sensors' | 'fleet';
    icon: React.ComponentType<{ className?: string }>;
    description: string;
    color: string;
}

export type EntityType = string; 
