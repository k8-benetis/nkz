/**
 * Copyright 2025 NKZ Platform (Nekazari)
 * Licensed under Apache-2.0
 * 
 * @see https://github.com/k8-benetis/nekazari-public/tree/main/packages/sdk
 */

export * from './auth/useAuth';
export * from './i18n/provider';
export * from './i18n/config';

// Viewer Context exports
export { useViewer, useViewerOptional, type ViewerContextValue } from './viewer/useViewer';

// API Client exports
export { NKZClient, type NKZClientOptions } from './api/client';

// Backward compatibility: Export legacy names as aliases
// These will be deprecated in v3.0.0
export { NKZClient as NekazariClient } from './api/client';
export type { NKZClientOptions as NekazariClientOptions } from './api/client';

