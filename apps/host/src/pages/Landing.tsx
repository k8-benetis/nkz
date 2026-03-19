import React from 'react';
import { isCommercialEdition } from '@/config/environment';
import { OSSLanding } from './landing/OSSLanding';
import { CommercialLanding } from './landing/CommercialLanding';

export const Landing: React.FC = () => {
  const isCommercial = isCommercialEdition();

  return isCommercial ? <CommercialLanding /> : <OSSLanding />;
};

export default Landing;
