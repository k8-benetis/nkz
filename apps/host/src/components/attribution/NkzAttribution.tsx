import React from 'react';

export type NkzAttributionVariant = 'oss' | 'commercial' | 'core';

const ROBOTIKA_URL = 'https://robotika.cloud/';

export const NkzAttribution: React.FC<{
  variant: NkzAttributionVariant;
  className?: string;
}> = ({ variant, className = '' }) => {
  const link = (
    <a
      href={ROBOTIKA_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="underline hover:opacity-80"
    >
      robotika.cloud
    </a>
  );

  let text: React.ReactNode;
  switch (variant) {
    case 'oss':
      text = (
        <>
          Powered by NKZ OS. Licensed under AGPL by {link}.
        </>
      );
      break;
    case 'commercial':
      text = (
        <>
          Powered by FIWARE & NKZ OS (AGPL). Built by {link}.
        </>
      );
      break;
    case 'core':
    default:
      text = (
        <>
          Nekazari Core: A FIWARE-Ready AgTech Twin. Licensed under AGPL by {link}.
        </>
      );
      break;
  }

  return <span className={className}>{text}</span>;
};

