import React from 'react';

export const PartnerLogos: React.FC = () => {
  const partners = [
    {
      name: 'Robotika.cloud',
      url: 'https://robotika.cloud/',
      logo: '/images/partners/logo-robotika.svg'
    },
    {
      name: 'Biosasun SL',
      url: 'https://biosasun.eu/',
      logo: '/images/partners/logo-biosasun.png'
    },
    {
      name: 'Asociación Allotarra',
      url: 'https://allotarra.eu/',
      logo: '/images/partners/logo-allotarra.webp'
    },
    {
      name: 'Artotxiki',
      url: 'https://artotxiki.com/',
      logo: '/images/partners/logo-artotxiki.png'
    }
  ];

  return (
    <div className="w-full bg-white py-16 border-y border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-sm font-semibold text-gray-500 uppercase tracking-wide mb-10">
          Confían en Nekazari
        </p>
        <div className="flex flex-wrap justify-center items-center gap-12 md:gap-24">
          {partners.map((partner, index) => (
            <a
              key={index}
              href={partner.url}
              target="_blank"
              rel="noopener noreferrer"
              title={partner.name}
              className="group block relative transition-transform duration-300 transform hover:scale-110"
            >
              <img
                src={partner.logo}
                alt={`Logo de ${partner.name}`}
                loading="lazy"
                className="max-h-16 w-auto object-contain opacity-70 grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500"
              />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
};