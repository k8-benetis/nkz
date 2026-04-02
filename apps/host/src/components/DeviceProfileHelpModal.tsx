import React from 'react';
import { X, FileJson, Download, BookOpen, AlertCircle, HelpCircle, List } from 'lucide-react';

interface DeviceProfileHelpModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SDM_ATTRIBUTES: Record<string, { attr: string; desc: string; unit: string }[]> = {
    AgriSensor: [
        { attr: 'airTemperature', desc: 'Air temperature', unit: 'CEL' },
        { attr: 'relativeHumidity', desc: 'Relative humidity', unit: '%' },
        { attr: 'atmosphericPressure', desc: 'Atmospheric pressure', unit: 'HPA' },
        { attr: 'solarRadiation', desc: 'Solar radiation', unit: 'W/m2' },
        { attr: 'windSpeed', desc: 'Wind speed', unit: 'm/s' },
        { attr: 'windDirection', desc: 'Wind direction', unit: 'DD' },
        { attr: 'precipitation', desc: 'Precipitation', unit: 'mm' },
        { attr: 'soilMoisture', desc: 'Soil moisture', unit: '%' },
        { attr: 'soilTemperature', desc: 'Soil temperature', unit: 'CEL' },
        { attr: 'soilConductivity', desc: 'Soil conductivity', unit: '' },
        { attr: 'leafTemperature', desc: 'Leaf temperature', unit: 'CEL' },
        { attr: 'leafWetness', desc: 'Leaf wetness', unit: '%' },
        { attr: 'photosyntheticallyActiveRadiation', desc: 'PAR', unit: 'umol/m2s' },
        { attr: 'panelTemperature', desc: 'PV panel temperature', unit: 'CEL' },
        { attr: 'panelInclination', desc: 'Panel tilt angle', unit: 'DD' },
        { attr: 'energyProduction', desc: 'Energy production', unit: 'kWh' },
        { attr: 'batteryLevel', desc: 'Battery level', unit: '%' },
        { attr: 'rssi', desc: 'Signal strength', unit: 'dBm' },
    ],
};

export const DeviceProfileHelpModal: React.FC<DeviceProfileHelpModalProps> = ({
    isOpen,
    onClose,
}) => {
    if (!isOpen) return null;

    const downloadTemplate = () => {
        const template = {
            name: "Agrivoltaic Station",
            description: "Weather station with temperature, humidity, solar radiation and panel tilt sensors.",
            sdm_entity_type: "AgriSensor",
            mappings: [
                {
                    incoming_key: "temp_c",
                    target_attribute: "airTemperature",
                    type: "Number",
                    transformation: "val"
                },
                {
                    incoming_key: "rel_humidity",
                    target_attribute: "relativeHumidity",
                    type: "Number",
                    transformation: "val / 100"
                },
                {
                    incoming_key: "pyranometer",
                    target_attribute: "solarRadiation",
                    type: "Number",
                    transformation: "val"
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
                            <h2 className="text-xl font-bold text-white">Device Profile Guide</h2>
                            <p className="text-indigo-100 text-sm mt-0.5">Map your IoT data to FIWARE Smart Data Models</p>
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
                            What is a Device Profile?
                        </h3>
                        <p className="text-blue-800 text-sm leading-relaxed">
                            A profile acts as a translator between your physical device and the platform.
                            It defines how each sensor field (e.g. <code className="bg-blue-100 px-1 rounded">temp_c</code>) maps to a
                            standard SDM attribute (e.g. <code className="bg-blue-100 px-1 rounded">airTemperature</code>).
                            Only mapped attributes reach the digital twin.
                        </p>
                    </div>

                    {/* Example Section */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-800 mb-3">Practical Example: Weather Station</h3>
                        <div className="grid md:grid-cols-2 gap-4">
                            <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                                <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Your Sensor (MQTT JSON)</h4>
                                <pre className="text-xs bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto font-mono">
                                    {`{
  "temp_c": 24.5,
  "rel_humidity": 65,
  "pyranometer": 450
}`}
                                </pre>
                            </div>
                            <div className="flex items-center justify-center md:hidden">
                                <div className="text-gray-400">Translated to</div>
                            </div>
                            <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-200">
                                <h4 className="text-sm font-semibold text-indigo-500 uppercase tracking-wider mb-2">Digital Twin (SDM)</h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between border-b border-indigo-100 pb-1">
                                        <span className="text-gray-600 font-mono">airTemperature</span>
                                        <span className="font-mono font-semibold text-indigo-700">24.5</span>
                                    </div>
                                    <div className="flex justify-between border-b border-indigo-100 pb-1">
                                        <span className="text-gray-600 font-mono">relativeHumidity</span>
                                        <span className="font-mono font-semibold text-indigo-700">0.65</span>
                                        <span className="text-xs text-gray-400 self-center">( / 100 )</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600 font-mono">solarRadiation</span>
                                        <span className="font-mono font-semibold text-indigo-700">450</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Key Concepts */}
                    <div className="grid md:grid-cols-3 gap-4">
                        <div className="p-4 border rounded-xl hover:shadow-md transition bg-gradient-to-br from-white to-gray-50">
                            <div className="font-semibold text-gray-900 mb-1">incoming_key</div>
                            <p className="text-xs text-gray-500">Exact field name in the JSON your device sends over MQTT.</p>
                        </div>
                        <div className="p-4 border rounded-xl hover:shadow-md transition bg-gradient-to-br from-white to-gray-50">
                            <div className="font-semibold text-gray-900 mb-1">target_attribute</div>
                            <p className="text-xs text-gray-500">Standard SDM attribute name. Must be from the list below.</p>
                        </div>
                        <div className="p-4 border rounded-xl hover:shadow-md transition bg-gradient-to-br from-white to-gray-50">
                            <div className="font-semibold text-gray-900 mb-1">transformation</div>
                            <p className="text-xs text-gray-500">Optional JEXL expression (e.g. <code>val * 0.1</code>) to convert units.</p>
                        </div>
                    </div>

                    {/* Valid SDM Attributes */}
                    <div>
                        <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                            <List className="w-5 h-5 text-indigo-600" />
                            Valid target_attribute values (AgriSensor)
                        </h3>
                        <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                            <div className="max-h-48 overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-gray-100 sticky top-0">
                                        <tr>
                                            <th className="text-left px-3 py-2 font-semibold text-gray-700">Attribute</th>
                                            <th className="text-left px-3 py-2 font-semibold text-gray-700">Description</th>
                                            <th className="text-left px-3 py-2 font-semibold text-gray-700">Unit</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {SDM_ATTRIBUTES.AgriSensor.map((row, i) => (
                                            <tr key={row.attr} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                                <td className="px-3 py-1.5 font-mono text-indigo-700">{row.attr}</td>
                                                <td className="px-3 py-1.5 text-gray-600">{row.desc}</td>
                                                <td className="px-3 py-1.5 text-gray-500">{row.unit}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-1 italic">
                            Using a value not in this list will cause a validation error on import.
                        </p>
                    </div>

                    {/* DaTaK auto-generation */}
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                        <h3 className="font-semibold text-emerald-900 mb-2 flex items-center gap-2">
                            <FileJson className="w-5 h-5 text-emerald-600" />
                            Auto-generate from DaTaK
                        </h3>
                        <p className="text-sm text-emerald-800 leading-relaxed">
                            If you use <a href="https://github.com/nkz-os/datak" target="_blank" rel="noopener noreferrer" className="underline font-medium">DaTaK</a> as
                            your edge gateway, it can auto-generate a compatible profile from your registered sensors:
                        </p>
                        <pre className="text-xs bg-gray-900 text-green-400 p-3 rounded-lg mt-2 font-mono overflow-x-auto">
                            {`curl http://<datak-ip>:8000/api/config/device-profile`}
                        </pre>
                        <p className="text-xs text-emerald-700 mt-2">
                            Save the JSON output and import it here with the "Import JSON" button.
                        </p>
                    </div>

                    {/* How to Get Data Section */}
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <h3 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-amber-600" />
                            How do I find my device's JSON format?
                        </h3>
                        <ol className="text-sm text-amber-800 space-y-2 list-decimal list-inside">
                            <li><b>Check the manual:</b> Look for "payload format", "API output" or "MQTT message".</li>
                            <li><b>Use a test tool:</b> MQTT Explorer, Postman, or the manufacturer's console.</li>
                            <li><b>Capture a message:</b> Connect your sensor to a test broker and observe the JSON.</li>
                            <li><b>Map the fields:</b> Note each field name (e.g. <code>temp_c</code>) and match it to an SDM attribute above.</li>
                        </ol>
                    </div>

                    {/* Action Footer */}
                    <div className="bg-gray-50 -mx-6 -mb-6 px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 border-t mt-2 rounded-b-2xl">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                            <AlertCircle className="w-4 h-4 text-amber-500" />
                            <span>Need a template to get started?</span>
                        </div>
                        <button
                            onClick={downloadTemplate}
                            className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-700 transition font-medium shadow-sm w-full md:w-auto justify-center"
                        >
                            <FileJson className="w-4 h-4" />
                            Download JSON Template
                            <Download className="w-4 h-4 ml-1 opacity-70" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
