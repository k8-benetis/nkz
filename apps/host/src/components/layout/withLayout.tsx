// =============================================================================
// withLayout HOC - Higher Order Component
// =============================================================================
// Wraps pages with Layout component automatically
// Usage: export default withLayout(MyPage);

import React from 'react';
import { Layout, LayoutProps } from '@/components/Layout';

export function withLayout<P extends object>(
  Component: React.ComponentType<P>,
  layoutProps?: Omit<LayoutProps, 'children'>
) {
  return function WrappedComponent(props: P) {
    return (
      <Layout {...layoutProps}>
        <Component {...props} />
      </Layout>
    );
  };
}

