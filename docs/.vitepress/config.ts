import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Nekazari',
  description: 'Open-source platform for precision agriculture, industry, and environmental sciences',
  base: '/nkz/',
  ignoreDeadLinks: true,

  head: [
    ['link', { rel: 'icon', type: 'image/x-icon', href: '/nkz/favicon.ico' }],
  ],

  themeConfig: {
    logo: '/logo.png',

    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'API', link: '/api/01-getting-started' },
      { text: 'Modules', link: '/development/EXTERNAL_DEVELOPER_GUIDE' },
      { text: 'GitHub', link: 'https://github.com/k8-benetis/nkz' },
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Quick Start', link: '/getting-started' },
          { text: 'Deployment Guide', link: '/DEPLOYMENT_GUIDE' },
          { text: 'Database Migrations', link: '/MIGRATIONS_REFERENCE' },
        ],
      },
      {
        text: 'Architecture',
        items: [
          { text: 'Platform Architecture', link: '/architecture/ARCHITECTURE' },
          { text: 'Module System', link: '/architecture/MODULE_SYSTEM_ARCHITECTURE' },
        ],
      },
      {
        text: 'API Reference',
        items: [
          { text: 'Getting Started', link: '/api/01-getting-started' },
          { text: 'Authentication', link: '/api/02-authentication' },
        ],
      },
      {
        text: 'Module Development',
        items: [
          { text: 'Developer Guide', link: '/development/EXTERNAL_DEVELOPER_GUIDE' },
          { text: 'Best Practices', link: '/development/MODULE_DEVELOPMENT_BEST_PRACTICES' },
          { text: 'Layer Integration', link: '/development/MODULE_LAYER_INTEGRATION' },
          { text: 'Module Installation', link: '/modules/EXTERNAL_MODULE_INSTALLATION' },
          { text: 'IIFE Bundle Spec', link: '/modules/MODULE_REMOTE_ENTRY_IIFE' },
        ],
      },
      {
        text: 'Operations',
        items: [
          { text: 'Backup System', link: '/BACKUP_SYSTEM' },
          { text: 'GitOps Migrations', link: '/GITOPS_MIGRATIONS' },
          { text: 'Risk Integrations', link: '/integrations/RISK_INTEGRATIONS' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/k8-benetis/nkz' },
    ],

    editLink: {
      pattern: 'https://github.com/k8-benetis/nkz/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    search: {
      provider: 'local',
    },

    footer: {
      message: 'Released under the AGPL-3.0 License.',
      copyright: 'Copyright 2024-present Nekazari Contributors',
    },
  },
})
