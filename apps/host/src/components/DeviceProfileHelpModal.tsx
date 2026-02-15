import React from 'react';
import { X, FileJson, Download, BookOpen, AlertCircle, HelpCircle } from 'lucide-react';

interface DeviceProfileHelpModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const DeviceProfileHelpModal: React.FC<DeviceProfileHelpModalProps> = ({
    isOpen,
    onClose,
}) => {
    if (!isOpen) return null;

    const downloadTemplate = () => {
        const template = {
            name: "Estación Metereológica Pro",
            description: "Perfil para estación meteorológica estándar con sensores de temperatura, humedad y viento.",
            entityType: "WeatherStation",
            mappings: [
                {
                    incoming_key: "temp_c",
                    target_attribute: "temperature",
                    type: "Number",
                    transformation: "val"
                },
                {
                    incoming_key: "rel_humidity",
                    target_attribute: "humidity",
                    type: "Number",
                    transformation: "val / 100"
                },
                {
                    incoming_key: "wind_kph",
                    target_attribute: "windSpeed",
                    type: "Number",
                    transformation: "val * 0.27778"
                }
            ]
        };

        const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'device-profile-template.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-5 flex justify-between items-start rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/20 rounded-lg backdrop-blur-md">
                            <BookOpen className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Guía de Perfiles de Dispositivo</h2>
                            <p className="text-indigo-100 text-sm mt-0.5">Aprende a mapear tus datos IoT</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-white/70 hover:text-white p-1 hover:bg-white/10 rounded-lg transition"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">

                    {/* Introduction */}
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                        <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                            <HelpCircle className="w-5 h-5 text-blue-600" />
                            ¿Qué es un Perfil de Dispositivo?
                        </h3>
                        <p className="text-blue-800 text-sm leading-relaxed">
                            Un perfil actúa como un "traductor" entre tu dispositivo físico y la plataforma.
                            Define qué datos envía tu sensor (ej: <code>temp_c</code>) y cómo deben guardarse en el sistema estándar (ej: <code>temperature</code>).
                        </p>
                    </div>

                    {/* Example Section */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-800 mb-3">Ejemplo Práctico: Estación Meteorológica</h3>
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Datos de tu Sensor (JSON)</h4>
                                <pre className="text-xs bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto font-mono">
                                    {`{
  "device_id": "ST-001",
  "temp_c": 24.5,
  "rel_humidity": 65,
  "wind_kph": 12.5
}`}
                                </pre>
                            </div>
                            <div className="flex items-center justify-center md:hidden">
                                <div className="text-gray-400">⬇️ Se traduce a ⬇️</div>
                            </div>
                            <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-200">
                                <h4 className="text-sm font-semibold text-indigo-500 uppercase tracking-wider mb-2">Datos en la Plataforma</h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between border-b border-indigo-100 pb-1">
                                        <span className="text-gray-600">temperature</span>
                                        <span className="font-mono font-semibold text-indigo-700">24.5</span>
                                    </div>
                                    <div className="flex justify-between border-b border-indigo-100 pb-1">
                                        <span className="text-gray-600">humidity</span>
                                        <span className="font-mono font-semibold text-indigo-700">0.65</span>
                                        <span className="text-xs text-gray-400 self-center">( / 100 )</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">windSpeed</span>
                                        <span className="font-mono font-semibold text-indigo-700">3.47</span>
                                        <span className="text-xs text-gray-400 self-center">( m/s )</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Key Concepts */}
                    <div className="grid md:grid-cols-3 gap-4">
                        <div className="p-4 border rounded-xl hover:shadow-md transition bg-gradient-to-br from-white to-gray-50">
                            <div className="font-semibold text-gray-900 mb-1">Incoming Key</div>
                            <p className="text-xs text-gray-500">Nombre exacto del campo en el JSON que envía tu dispositivo.</p>
                        </div>
                        <div className="p-4 border rounded-xl hover:shadow-md transition bg-gradient-to-br from-white to-gray-50">
                            <div className="font-semibold text-gray-900 mb-1">Target Attribute</div>
                            <p className="text-xs text-gray-500">Nombre del atributo estándar en la plataforma donde se guardará.</p>
                        </div>
                        <div className="p-4 border rounded-xl hover:shadow-md transition bg-gradient-to-br from-white to-gray-50">
                            <div className="font-semibold text-gray-900 mb-1">Transformation</div>
                            <p className="text-xs text-gray-500">Fórmula matemática opcional (ej: <code>val * 100</code>) para convertir unidades.</p>
                        </div>
                    </div>

                    {/* How to Get Data Section */}
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <h3 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-amber-600" />
                            ¿Cómo Consigo el JSON de mi Dispositivo?
                        </h3>
                        <ol className="text-sm text-amber-800 space-y-2 list-decimal list-inside">
                            <li><b>Consulta el manual:</b> Busca "payload format", "API output" o "MQTT message".</li>
                            <li><b>Usa una herramienta de test:</b> MQTT Explorer, Postman, o la consola del fabricante.</li>
                            <li><b>Captura un mensaje:</b> Conecta tu sensor a un broker de prueba y observa el JSON recibido.</li>
                            <li><b>Identifica los campos:</b> Anota el nombre exacto de cada campo (ej: <code>temp_c</code>, <code>soil_moisture</code>).</li>
                        </ol>
                        <p className="text-xs text-amber-700 mt-3 italic">
                            Consejo: Si el JSON tiene campos anidados (ej: <code>data.sensors.temperature</code>), usa la notación con puntos.
                        </p>
                        <div className="mt-3 pt-3 border-t border-amber-200">
                            <a
                                href="https://github.com/k8-benetis/datak"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 text-sm font-medium text-amber-800 hover:text-amber-900 transition"
                            >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" /></svg>
                                DataK - Herramienta de Captura y Envío de Datos
                            </a>
                        </div>
                    </div>

                    {/* Action Footer */}
                    <div className="bg-gray-50 -mx-6 -mb-6 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 border-t mt-2 rounded-b-2xl">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                            <AlertCircle className="w-4 h-4 text-amber-500" />
                            <span>¿Necesitas una plantilla para empezar?</span>
                        </div>
                        <button
                            onClick={downloadTemplate}
                            className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition font-medium shadow-sm w-full md:w-auto justify-center"
                        >
                            <FileJson className="w-4 h-4" />
                            Descargar Plantilla JSON
                            <Download className="w-4 h-4 ml-1 opacity-70" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
