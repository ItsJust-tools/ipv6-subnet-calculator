import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import manifest from '@/app/manifest';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import ErrorPage from '@/app/error';
import NotFound from '@/app/not-found';
import { JsonLd } from '@/app/json-ld';
import ToolPage from '@/app/page';
import { generateJsonLd, generateToolMetadata } from '@/lib/seo';
import toolConfig from '@/tool/tool.config';
import { getPublicSiteUrl, templateMetadata } from '@/tool/template-metadata';
import { ipv6SubnetCalculatorTool } from '@/tool/tool-definition';
import { DEFAULT_STATE as BASE_DEFAULT_STATE, type ToolState } from '@/tool/types';
import { Canvas } from '@/tool/components/Canvas';
import { Sidebar } from '@/tool/components/Sidebar';
import { Toolbar } from '@/tool/components/Toolbar';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/app/tool-client-wrapper', () => ({
  default: () => <div data-testid="tool-client-wrapper">tool-client-wrapper</div>,
}));

describe('app and seo', () => {
  it('builds metadata and json-ld values', () => {
    const metadata = generateToolMetadata(toolConfig);
    const jsonLd = generateJsonLd(toolConfig);

    expect(metadata.creator).toBe(toolConfig.name);
    expect(jsonLd.featureList.length).toBeGreaterThan(0);
  });

  it('returns site manifest, robots and sitemap', () => {
    const man = manifest();
    const rob = robots();
    const sm = sitemap();

    expect(man.name).toBe(templateMetadata.appName);
    expect(rob.sitemap).toBe('http://localhost:3000/sitemap.xml');
    expect(sm[0]?.url).toBe('http://localhost:3000');
  });

  it('renders json-ld script safely', () => {
    render(<JsonLd config={{ ...toolConfig, name: '</script>' }} />);
    const script = document.querySelector('script[type="application/ld+json"]');
    expect(script?.innerHTML).toContain('\\u003c/script>');
  });

  it('renders error page', () => {
    render(<ErrorPage error={new Error('boom')} reset={vi.fn()} />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders not-found page', () => {
    render(<NotFound />);
    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
  });

  it('renders top-level tool page', () => {
    render(<ToolPage />);
    expect(screen.getByTestId('tool-client-wrapper')).toBeInTheDocument();
    expect(document.querySelector('script[type="application/ld+json"]')).toBeInTheDocument();
  });
});

describe('tool definition', () => {
  it('exposes the configured tool identity', () => {
    expect(ipv6SubnetCalculatorTool.name).toBe(toolConfig.name);
    expect(ipv6SubnetCalculatorTool.id).toBe('ipv6-subnet-calculator');
    expect(getPublicSiteUrl()).toBe('http://localhost:3000');
  });

  it('serializes state with compact fields', () => {
    const serialized = ipv6SubnetCalculatorTool.serialize({
      ...BASE_DEFAULT_STATE,
      address: 'fd00::1',
      prefix: '48',
    });
    expect(serialized).toContain('"address":"fd00::1"');
    expect(serialized).toContain('"prefix":"48"');
  });

  it('deserializes with recovery defaults', () => {
    const repaired = ipv6SubnetCalculatorTool.deserialize({ nope: true });
    expect(repaired.success).toBe(true);
    if (!repaired.success) return;
    expect(repaired.data.mode).toBe(BASE_DEFAULT_STATE.mode);
    expect(repaired.data.history).toEqual([]);
  });

  it('has four exporters', async () => {
    const exporters = ipv6SubnetCalculatorTool.exporters ?? [];
    expect(exporters.length).toBe(4);
    const firstExporter = exporters[0];
    if (!firstExporter) throw new Error('missing exporter');
    const png = await firstExporter.loader();
    const resolved = 'default' in png ? png.default : (png as { exporter: unknown }).exporter;
    expect((resolved as { format: string }).format).toBe('png');
  });
});

describe('tool components', () => {
  const base: ToolState = { ...BASE_DEFAULT_STATE };

  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders toolbar with clear and copy buttons', () => {
    render(<Toolbar state={base} onChange={() => {}} onClear={() => {}} onCopy={() => {}} />);
    expect(screen.getByTestId('btn-clear')).toBeInTheDocument();
    expect(screen.getByTestId('btn-copy-result')).toBeInTheDocument();
  });

  it('toolbar clear-history button appears only with history', () => {
    const { rerender } = render(<Toolbar state={base} onChange={() => {}} onClear={() => {}} />);
    expect(screen.queryByTestId('btn-clear-history')).toBeNull();
    rerender(
      <Toolbar
        state={{ ...base, history: [{ text: 'x', createdAt: 't' }] }}
        onChange={() => {}}
        onClear={() => {}}
      />
    );
    expect(screen.getByTestId('btn-clear-history')).toBeInTheDocument();
  });

  it('renders sidebar with summary and history count', () => {
    render(<Sidebar state={base} onChange={() => {}} />);
    expect(screen.getByTestId('ipv6-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-history-count')).toHaveTextContent('0 entries in history');
  });

  it('canvas renders mode buttons and inputs', () => {
    render(<Canvas state={base} onChange={() => {}} />);
    expect(screen.getByTestId('address-input')).toBeInTheDocument();
    expect(screen.getByTestId('prefix-input')).toBeInTheDocument();
    expect(screen.getByTestId('mode-analyze')).toBeInTheDocument();
  });

  it('canvas analysis shows network, first host and totals', () => {
    render(
      <Canvas state={{ ...base, address: '2001:db8::1', prefix: '32' }} onChange={() => {}} />
    );
    expect(screen.getByTestId('analysis-results')).toBeInTheDocument();
    expect(screen.getByTestId('result-network')).toHaveTextContent('2001:db8::');
    expect(screen.getByTestId('result-first-host')).toHaveTextContent('2001:db8::1');
    expect(screen.getByTestId('result-counts')).toBeInTheDocument();
  });

  it('canvas expand mode shows expanded and compressed forms', () => {
    render(
      <Canvas
        state={{ ...base, mode: 'expand', address: '::1', prefix: '128' }}
        onChange={() => {}}
      />
    );
    expect(screen.getByTestId('result-expanded')).toHaveTextContent(
      '0000:0000:0000:0000:0000:0000:0000:0001'
    );
    expect(screen.getByTestId('result-compressed')).toHaveTextContent('::1');
  });

  it('canvas split mode shows split input and ranges', () => {
    render(
      <Canvas
        state={{ ...base, mode: 'split', address: '2001:db8::', prefix: '32', splitCount: '4' }}
        onChange={() => {}}
      />
    );
    expect(screen.getByTestId('split-input')).toBeInTheDocument();
    expect(screen.getAllByTestId('subnet-range-row')).toHaveLength(4);
  });

  it('canvas shows validation errors without crashing', () => {
    render(<Canvas state={{ ...base, address: 'not-valid', prefix: '32' }} onChange={() => {}} />);
    expect(screen.getByTestId('error-message')).toBeInTheDocument();
  });

  it('canvas changes propagate through onChange', () => {
    const onChange = vi.fn();
    render(<Canvas state={base} onChange={onChange} />);
    fireEvent.change(screen.getByTestId('address-input'), { target: { value: 'fd00::1' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('mode buttons switch the mode', () => {
    const onChange = vi.fn();
    render(<Canvas state={base} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('mode-split'));
    const call = onChange.mock.calls[0]?.[0] as ToolState | undefined;
    expect(call?.mode).toBe('split');
  });
});
