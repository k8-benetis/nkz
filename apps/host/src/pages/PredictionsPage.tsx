import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/KeycloakAuthContext';
import { parcelApi } from '@/services/parcelApi';
import { Parcel } from '@/types';
import { Brain, TrendingUp, Battery, Sprout, Bug } from 'lucide-react';

interface Algorithm {
    id: string;
    name: string;
    description: string;
    icon: React.ElementType;
    status: 'ready' | 'training' | 'beta';
}

const ALGORITHMS: Algorithm[] = [
    { id: 'harvest-pred', name: 'Predicción de Cosecha', description: 'Estima el rendimiento basado en NDVI y clima histórico.', icon: Sprout, status: 'ready' },
    { id: 'pest-risk', name: 'Riesgo de Plagas', description: 'Alerta temprana de mildiu y oidio.', icon: Bug, status: 'beta' },
    { id: 'battery-life', name: 'Vida Útil Batería', description: 'Predicción de degradación para flota de robots.', icon: Battery, status: 'ready' },
    { id: 'market-price', name: 'Precios de Mercado', description: 'Tendencias de precios para cultivos actuales.', icon: TrendingUp, status: 'training' },
];

export const PredictionsPage: React.FC = () => {
    const { user: _user } = useAuth();
    const [parcels, setParcels] = useState<Parcel[]>([]);
    const [selectedAlgo, setSelectedAlgo] = useState<string | null>(null);
    const [_loading, setLoading] = useState(true);

    useEffect(() => {
        const loadParcels = async () => {
            try {
                const data = await parcelApi.getParcels();
                setParcels(data);
            } catch (error) {
                console.error('Error loading parcels:', error);
            } finally {
                setLoading(false);
            }
        };
        loadParcels();
    }, []);

    return (
        <>
            <div className="p-6 max-w-7xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Brain className="h-8 w-8 text-purple-600" />
                        Predicciones & Inteligencia Artificial
                    </h1>
                    <p className="text-gray-500 mt-1">Centro de modelos predictivos y análisis avanzado.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Sidebar: Algoritmos */}
                    <div className="lg:col-span-1 space-y-4">
                        <h2 className="text-lg font-semibold text-gray-700">Algoritmos Disponibles</h2>
                        <div className="space-y-2">
                            {ALGORITHMS.map((algo) => (
                                <button
                                    key={algo.id}
                                    onClick={() => setSelectedAlgo(algo.id)}
                                    className={`w-full text-left p-4 rounded-xl border transition-all ${selectedAlgo === algo.id
                                        ? 'border-purple-500 bg-purple-50 shadow-md'
                                        : 'border-gray-200 bg-white hover:border-purple-300 hover:bg-gray-50'
                                        }`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className={`p-2 rounded-lg ${selectedAlgo === algo.id ? 'bg-purple-200' : 'bg-gray-100'}`}>
                                            <algo.icon className={`h-5 w-5 ${selectedAlgo === algo.id ? 'text-purple-700' : 'text-gray-600'}`} />
                                        </div>
                                        {algo.status === 'beta' && <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">Beta</span>}
                                        {algo.status === 'training' && <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">Training</span>}
                                    </div>
                                    <h3 className={`font-medium ${selectedAlgo === algo.id ? 'text-purple-900' : 'text-gray-900'}`}>{algo.name}</h3>
                                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{algo.description}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Main Content: Studio */}
                    <div className="lg:col-span-3">
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 min-h-[600px] p-6">
                            {selectedAlgo ? (
                                <div className="h-full flex flex-col">
                                    <div className="flex items-center justify-between border-b pb-4 mb-6">
                                        <h2 className="text-xl font-bold text-gray-800">
                                            {ALGORITHMS.find(a => a.id === selectedAlgo)?.name}
                                        </h2>
                                        <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
                                            Ejecutar Modelo
                                        </button>
                                    </div>

                                    {/* Mock Visualization Area */}
                                    <div className="flex-1 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center flex-col gap-4">
                                        <TrendingUp className="h-16 w-16 text-gray-300" />
                                        <p className="text-gray-400 font-medium">Visualización del Modelo</p>
                                        <p className="text-sm text-gray-400">Selecciona parámetros para generar una predicción</p>
                                    </div>

                                    {/* Mock Parameters */}
                                    <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="p-4 bg-gray-50 rounded-lg">
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Parcela Objetivo</label>
                                            <select className="w-full border-gray-300 rounded-md shadow-sm focus:border-purple-500 focus:ring-purple-500">
                                                <option>Seleccionar parcela...</option>
                                                {parcels.map(p => (
                                                    <option key={p.id} value={p.id}>{p.name || p.id}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="p-4 bg-gray-50 rounded-lg">
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Horizonte Temporal</label>
                                            <select className="w-full border-gray-300 rounded-md shadow-sm focus:border-purple-500 focus:ring-purple-500">
                                                <option>7 días</option>
                                                <option>30 días</option>
                                                <option>Fin de campaña</option>
                                            </select>
                                        </div>
                                        <div className="p-4 bg-gray-50 rounded-lg">
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Sensibilidad</label>
                                            <input type="range" className="w-full accent-purple-600" />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center p-12">
                                    <div className="bg-purple-50 p-6 rounded-full mb-6">
                                        <Brain className="h-16 w-16 text-purple-600" />
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900 mb-2">Selecciona un Algoritmo</h3>
                                    <p className="text-gray-500 max-w-md">
                                        Elige uno de los modelos de inteligencia artificial disponibles en el panel lateral para comenzar una simulación o predicción.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};
