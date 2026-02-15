// =============================================================================
// Module Error Boundary - Isolates Module Failures
// =============================================================================
// Prevents a single module failure from crashing the entire application.
// Each module widget is wrapped in this boundary for isolation.

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

interface ModuleErrorBoundaryProps {
    moduleId: string;
    moduleName: string;
    children: ReactNode;
    /** Optional: Custom fallback UI */
    fallback?: ReactNode;
    /** Optional: Callback when error occurs */
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
    /** Optional: Array of values that should trigger a reset of the error boundary when changed */
    resetKeys?: any[];
}

interface ModuleErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

export class ModuleErrorBoundary extends Component<
    ModuleErrorBoundaryProps,
    ModuleErrorBoundaryState
> {
    constructor(props: ModuleErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
        };
    }

    static getDerivedStateFromError(error: Error): Partial<ModuleErrorBoundaryState> {
        return {
            hasError: true,
            error,
        };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Log error with module context
        console.error(`[ModuleErrorBoundary] Module ${this.props.moduleId} failed:`, error, errorInfo);

        // Update state with error info
        this.setState({
            error,
            errorInfo,
        });

        // Call optional error callback
        if (this.props.onError) {
            this.props.onError(error, errorInfo);
        }

        // TODO: Send to error tracking service (Sentry, etc.)
        // errorTracker.captureException(error, {
        //     tags: { moduleId: this.props.moduleId },
        //     extra: { errorInfo },
        // });
    }

    handleRetry = () => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
        });
    };

    handleDismiss = () => {
        // Don't reset error, just hide the widget
        // This allows user to continue using the app
        this.setState({
            hasError: true,
            error: null, // Clear error to hide UI
            errorInfo: null,
        });
    };

    componentDidUpdate(prevProps: ModuleErrorBoundaryProps) {
        if (this.state.hasError && this.props.resetKeys) {
            // Check if any reset key has changed
            const hasChanged = this.props.resetKeys.some((key, index) => {
                return key !== (prevProps.resetKeys && prevProps.resetKeys[index]);
            });

            if (hasChanged) {
                console.log(`[ModuleErrorBoundary] Resetting error state for module ${this.props.moduleId} due to key change`);
                this.handleRetry();
            }
        }
    }

    render() {
        if (this.state.hasError) {
            // If error was dismissed, don't render anything
            if (!this.state.error) {
                return null;
            }

            // Use custom fallback if provided
            if (this.props.fallback) {
                return <>{this.props.fallback}</>;
            }

            // Default error UI
            return (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start gap-3">
                        <div className="p-2 bg-red-100 rounded-lg flex-shrink-0">
                            <AlertTriangle className="w-5 h-5 text-red-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-red-900 mb-1">
                                Error en módulo: {this.props.moduleName}
                            </h4>
                            <p className="text-sm text-red-700 mb-3">
                                El módulo <code className="text-xs bg-red-100 px-1 py-0.5 rounded">{this.props.moduleId}</code> no está disponible temporalmente.
                            </p>

                            {/* Show error details in development */}
                            {process.env.NODE_ENV === 'development' && this.state.error && (
                                <details className="mt-2 text-xs">
                                    <summary className="cursor-pointer text-red-600 hover:text-red-800 mb-1">
                                        Detalles técnicos (solo desarrollo)
                                    </summary>
                                    <pre className="mt-2 p-2 bg-red-100 rounded text-red-900 overflow-auto max-h-40">
                                        {this.state.error.toString()}
                                        {this.state.errorInfo?.componentStack && (
                                            <>
                                                {'\n\nComponent Stack:\n'}
                                                {this.state.errorInfo.componentStack}
                                            </>
                                        )}
                                    </pre>
                                </details>
                            )}

                            <div className="flex gap-2 mt-3">
                                <button
                                    onClick={this.handleRetry}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    Reintentar
                                </button>
                                <button
                                    onClick={this.handleDismiss}
                                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-lg transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                    Ocultar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

// Hook version for functional components (alternative approach)
export const useModuleErrorBoundary = (moduleId: string) => {
    const [error, setError] = React.useState<Error | null>(null);

    React.useEffect(() => {
        const errorHandler = (event: ErrorEvent) => {
            // Only catch errors from this module's components
            // This is a simplified version - full implementation would need module context
            setError(new Error(event.message));
        };

        window.addEventListener('error', errorHandler);
        return () => window.removeEventListener('error', errorHandler);
    }, [moduleId]);

    return error;
};

