import React from 'react';
import { isCommercialEdition, getConfig } from '@/config/environment';
import { OSSLanding } from './landing/OSSLanding';
import { CommercialLanding } from './landing/CommercialLanding';

export const Landing: React.FC = () => {
  const envDefault = isCommercialEdition();
  const [isCommercial, setIsCommercial] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    let mounted = true;
    const loadLandingMode = async () => {
      try {
        const base = getConfig().api.baseUrl;
        const res = await fetch(`${base}/api/public/platform-settings`, { credentials: 'include' });
        if (!res.ok) { if (mounted) setIsCommercial(envDefault); return; }
        const data = await res.json();
        if (!mounted) return;
        setIsCommercial(String(data?.landing_mode || '').toLowerCase() === 'commercial');
      } catch {
        if (mounted) setIsCommercial(envDefault);
      }
    };
    loadLandingMode();
    return () => { mounted = false; };
  }, []);

  if (isCommercial === null) return null;
  return isCommercial ? <CommercialLanding /> : <OSSLanding />;
};

export default Landing;
