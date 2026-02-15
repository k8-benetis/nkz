// =============================================================================
// Intelligence Module Info Page - Backend-Only Module Information
// =============================================================================
// This page is shown when users navigate to /intelligence
// Since this is a backend-only module, it doesn't have a frontend component.
// Instead, this page explains what the module does and how to use it.

import React from 'react';
import { Brain, Server, Code, Network, AlertCircle, CheckCircle2, Zap, Database } from 'lucide-react';
import { Card } from '@nekazari/ui-kit';

export const IntelligenceInfoPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50 p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-purple-600 to-indigo-600 mb-4 shadow-lg">
            <Brain className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Intelligence Module
          </h1>
          <p className="text-xl text-gray-600">
            AI/ML Analysis and Prediction Service
          </p>
          <div className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
            <Server className="w-4 h-4" />
            Backend-Only Module
          </div>
        </div>

        {/* What is this module? */}
        <Card className="mb-6" padding="lg">
          <div className="flex items-start gap-4 mb-4">
            <div className="p-3 rounded-lg bg-purple-100">
              <AlertCircle className="w-6 h-6 text-purple-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                ¿Qué es este módulo?
              </h2>
              <p className="text-gray-700 leading-relaxed">
                El módulo <strong>Intelligence</strong> es un servicio backend que proporciona capacidades de 
                Inteligencia Artificial y Machine Learning para análisis y predicciones de datos agrícolas. 
                Este módulo <strong>no tiene interfaz de usuario</strong> - funciona exclusivamente como un servicio API 
                que puede ser utilizado por otros componentes de la plataforma.
              </p>
            </div>
          </div>
        </Card>

        {/* Features */}
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <Card padding="lg">
            <div className="flex items-start gap-3 mb-4">
              <Zap className="w-6 h-6 text-purple-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Capacidades</h3>
                <ul className="space-y-2 text-gray-700">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>Predicciones basadas en análisis de series temporales</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>Procesamiento asíncrono de trabajos de análisis</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>Integración con modelos de Machine Learning</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                    <span>Generación de entidades Prediction en Orion-LD</span>
                  </li>
                </ul>
              </div>
            </div>
          </Card>

          <Card padding="lg">
            <div className="flex items-start gap-3 mb-4">
              <Network className="w-6 h-6 text-indigo-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Endpoints API</h3>
                <ul className="space-y-2 text-sm font-mono text-gray-700">
                  <li className="flex items-center gap-2">
                    <Code className="w-4 h-4 text-gray-400" />
                    <span>POST /api/intelligence/analyze</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Code className="w-4 h-4 text-gray-400" />
                    <span>POST /api/intelligence/predict</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Code className="w-4 h-4 text-gray-400" />
                    <span>GET /api/intelligence/jobs/{'{job_id}'}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Code className="w-4 h-4 text-gray-400" />
                    <span>POST /api/intelligence/webhook/n8n</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Code className="w-4 h-4 text-gray-400" />
                    <span>GET /api/intelligence/plugins</span>
                  </li>
                </ul>
              </div>
            </div>
          </Card>
        </div>

        {/* How it works */}
        <Card className="mb-6" padding="lg">
          <div className="flex items-start gap-4 mb-4">
            <div className="p-3 rounded-lg bg-indigo-100">
              <Database className="w-6 h-6 text-indigo-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900 mb-3">
                ¿Cómo funciona?
              </h2>
              <div className="space-y-4 text-gray-700">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-semibold">
                    1
                  </div>
                  <div>
                    <p className="font-medium mb-1">Las predicciones se generan automáticamente</p>
                    <p className="text-sm text-gray-600">
                      El módulo procesa datos históricos y genera entidades <code className="bg-gray-100 px-1 rounded">Prediction</code> 
                      que se almacenan en Orion-LD siguiendo el estándar NGSI-LD de FIWARE.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold">
                    2
                  </div>
                  <div>
                    <p className="font-medium mb-1">Visualización en el Timeline</p>
                    <p className="text-sm text-gray-600">
                      Las predicciones aparecen automáticamente en el <strong>Timeline</strong> del visor principal 
                      cuando visualizas datos históricos de sensores.
                    </p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-semibold">
                    3
                  </div>
                  <div>
                    <p className="font-medium mb-1">Integración con n8n</p>
                    <p className="text-sm text-gray-600">
                      Puedes configurar workflows en n8n que llamen a los endpoints del módulo para automatizar 
                      análisis y generar predicciones programadas.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Technical details */}
        <Card padding="lg">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Detalles Técnicos
          </h2>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-semibold text-gray-700 mb-2">Arquitectura</p>
              <ul className="space-y-1 text-gray-600">
                <li>• Backend: FastAPI (Python 3.11)</li>
                <li>• Cola de trabajos: Redis</li>
                <li>• Integración: Orion-LD (NGSI-LD)</li>
                <li>• Procesamiento: Asíncrono</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-gray-700 mb-2">Estado del Servicio</p>
              <ul className="space-y-1 text-gray-600">
                <li>• Disponible: API REST activa</li>
                <li>• Health Check: /health</li>
                <li>• Documentación: /api/intelligence/docs</li>
                <li>• Versión: 1.0.0</li>
              </ul>
            </div>
          </div>
        </Card>

        {/* Call to action */}
        <div className="mt-8 text-center">
          <p className="text-gray-600 mb-4">
            Para usar este módulo, navega al <strong>Visor Unificado</strong> y visualiza datos históricos 
            de tus sensores. Las predicciones aparecerán automáticamente en el timeline.
          </p>
          <a
            href="/entities"
            className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
          >
            Ir al Visor Unificado
          </a>
        </div>
      </div>
    </div>
  );
};

