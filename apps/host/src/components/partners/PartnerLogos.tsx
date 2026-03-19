import React from 'react';

export const PartnerLogos: React.FC = () => {
  return (
    <div className="w-full bg-white py-12 border-y border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-sm font-semibold text-gray-500 uppercase tracking-wide mb-8">
          Confían en Nekazari
        </p>
        <div className="flex justify-center items-center gap-12 md:gap-24 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
          {/* Placeholder for real logos - replace with actual svgs/pngs */}
          <div className="text-xl font-bold font-serif text-gray-800">Robotika<span className="text-green-600">.cloud</span></div>
          <div className="text-xl font-bold font-mono text-gray-800">Agro<span className="text-blue-600">Tech</span></div>
          <div className="text-xl font-bold text-gray-800">FIWARE</div>
        </div>
      </div>
    </div>
  );
};