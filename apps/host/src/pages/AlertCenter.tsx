import React from 'react';
import { Layout } from '@/components/Layout';
import { SmartRiskPanel } from '@/components/SmartRiskPanel';
import { Bell, Shield } from 'lucide-react';

export const AlertCenter: React.FC = () => {
    return (
        <Layout>
            <div className="p-6 max-w-7xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Bell className="h-8 w-8 text-purple-600" />
                        Centro de Alertas
                    </h1>
                    <p className="text-gray-500 mt-1">
                        Gestiona tus suscripciones a riesgos y configura notificaciones automáticas.
                    </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                        <SmartRiskPanel />
                    </div>

                    <div className="space-y-6">
                        <div className="bg-blue-50 rounded-xl p-6 border border-blue-100">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                                    <Shield className="h-6 w-6" />
                                </div>
                                <h3 className="font-semibold text-blue-900">Protección Activa</h3>
                            </div>
                            <p className="text-sm text-blue-800 mb-4">
                                El sistema monitorea activamente 24/7 las condiciones de tus parcelas.
                                Las alertas críticas se enviarán inmediatamente.
                            </p>
                            <div className="text-xs text-blue-600 font-mono bg-blue-100/50 p-2 rounded">
                                Status: SYSTEM_OK
                                <br />
                                Last Check: {new Date().toLocaleTimeString()}
                            </div>
                        </div>

                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                            <h3 className="font-semibold text-gray-900 mb-4">Historial Reciente</h3>
                            <div className="space-y-4">
                                <div className="flex gap-3 text-sm">
                                    <span className="text-gray-400 font-mono text-xs">10:42</span>
                                    <p className="text-gray-600">Sistema iniciado correctamente.</p>
                                </div>
                                <div className="flex gap-3 text-sm">
                                    <span className="text-gray-400 font-mono text-xs">09:15</span>
                                    <p className="text-gray-600">Sincronización de clima completada.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
};
