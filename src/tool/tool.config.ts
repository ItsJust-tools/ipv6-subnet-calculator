import type { ExportFormat } from '@itsjust/core';

export const toolConfig = {
  id: 'ipv6-subnet-calculator',
  name: 'IPv6 Subnet Calculator',
  version: '1.0.0',
  category: 'Developer',
  description:
    'Calculate IPv6 subnets: expand/compress addresses, compute prefix ranges, first/last host, total addresses, and subnet splits for any IPv6 CIDR block.',
  features: {
    sidebar: true,
    export: true,
    autoSave: true,
    undoRedo: true,
    statusBar: true,
    darkMode: true,
  },
  exportFormats: ['png', 'jpeg', 'webp', 'pdf', 'json'] satisfies ExportFormat[],
  theme: {
    brand: 'IPv6 Subnet Calculator',
  },
};

export default toolConfig;
