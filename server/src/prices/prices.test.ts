import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import { resolvePrices } from './pricesService.js';
import { createOpenPricesProvider } from './providers/openPrices.js';
import type { OnlinePrice, PriceProvider } from './providers/types.js';
import { TtlCache } from '../cache/ttlCache.js';
import { createApp } from '../app.js';
import { MockLlmClient } from '../llm/llmClient.js';
import { defaultMockResponder } from '../llm/mockResponder.js';

function makePrice(overrides: Partial<OnlinePrice> = {}): OnlinePrice {
  return {
    pricePerPackage: 1.99,
    packageSize: 1000,
    packageUnit: 'g',
    currency: 'EUR',
    source: 'open-prices',
    updatedAt: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

describe('resolvePrices (Orchestrierung)', () => {
  it('Flag aus -> alle Items "unknown", Provider wird NICHT aufgerufen', async () => {
    const spy = vi.fn(async () => makePrice());
    const provider: PriceProvider = { name: 'Spy', priceFor: spy };
    const res = await resolvePrices([{ key: '111111' }, { key: '222222' }], {
      online: false,
      providers: [provider],
    });
    expect(spy).not.toHaveBeenCalled();
    expect(res).toHaveLength(2);
    expect(res.every((r) => r.source === 'unknown')).toBe(true);
    expect(res[0]).toEqual({
      key: '111111',
      pricePerPackage: null,
      packageSize: null,
      packageUnit: null,
      currency: 'EUR',
      source: 'unknown',
      updatedAt: null,
    });
  });

  it('ohne Provider -> alle "unknown" (auch bei online=true)', async () => {
    const res = await resolvePrices([{ key: 'x' }], { online: true, providers: [] });
    expect(res[0]?.source).toBe('unknown');
  });

  it('Flag an + Provider liefert Preis -> source "open-prices", Werte übernommen', async () => {
    const provider: PriceProvider = {
      name: 'Fake',
      priceFor: vi.fn(async () =>
        makePrice({ pricePerPackage: 2.49, packageSize: 500, packageUnit: 'ml' }),
      ),
    };
    const res = await resolvePrices([{ key: '4001234567890' }], {
      online: true,
      providers: [provider],
    });
    expect(res[0]).toMatchObject({
      key: '4001234567890',
      pricePerPackage: 2.49,
      packageSize: 500,
      packageUnit: 'ml',
      currency: 'EUR',
      source: 'open-prices',
    });
  });

  it('Provider-Fehler/Timeout -> "unknown" ohne Crash', async () => {
    const boom: PriceProvider = {
      name: 'Boom',
      priceFor: vi.fn(async () => {
        throw new Error('network down');
      }),
    };
    const res = await resolvePrices([{ key: '111111' }], {
      online: true,
      providers: [boom],
    });
    expect(res[0]?.source).toBe('unknown');
    expect(res[0]?.pricePerPackage).toBeNull();
  });

  it('kein Treffer (Provider null) -> "unknown" + Negativ-Cache (kein zweiter Aufruf)', async () => {
    const nullProvider = { name: 'NullP', priceFor: vi.fn(async () => null) };
    const cache = new TtlCache<OnlinePrice | null>(1000);
    const first = await resolvePrices([{ key: '111111' }], {
      online: true,
      providers: [nullProvider],
      cache,
    });
    expect(first[0]?.source).toBe('unknown');
    await resolvePrices([{ key: '111111' }], {
      online: true,
      providers: [nullProvider],
      cache,
    });
    expect(nullProvider.priceFor).toHaveBeenCalledTimes(1);
  });

  it('Treffer wird gecacht -> zweiter Aufruf ohne erneute Abfrage', async () => {
    const hitProvider = { name: 'Hit', priceFor: vi.fn(async () => makePrice()) };
    const cache = new TtlCache<OnlinePrice | null>(1000);
    await resolvePrices([{ key: '111111' }], { online: true, providers: [hitProvider], cache });
    await resolvePrices([{ key: '111111' }], { online: true, providers: [hitProvider], cache });
    expect(hitProvider.priceFor).toHaveBeenCalledTimes(1);
  });

  it('mehrere Provider: erster Treffer gewinnt, zweiter wird nicht befragt', async () => {
    const first = { name: 'A', priceFor: vi.fn(async () => makePrice({ pricePerPackage: 1 })) };
    const second = { name: 'B', priceFor: vi.fn(async () => makePrice({ pricePerPackage: 2 })) };
    const res = await resolvePrices([{ key: '111111' }], {
      online: true,
      providers: [first, second],
    });
    expect(res[0]?.pricePerPackage).toBe(1);
    expect(second.priceFor).not.toHaveBeenCalled();
  });

  it('Reihenfolge/Anzahl = Eingabe (auch bei gemischten Treffern)', async () => {
    const provider: PriceProvider = {
      name: 'Mixed',
      priceFor: vi.fn(async (item) => (item.key === '222222' ? makePrice() : null)),
    };
    const res = await resolvePrices([{ key: '111111' }, { key: '222222' }, { key: '333333' }], {
      online: true,
      providers: [provider],
    });
    expect(res.map((r) => r.key)).toEqual(['111111', '222222', '333333']);
    expect(res.map((r) => r.source)).toEqual(['unknown', 'open-prices', 'unknown']);
  });
});

describe('Open Prices Provider (fetch gemockt)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('ohne Barcode (kein Ziffern-key) -> null, kein fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const provider = createOpenPricesProvider();
    expect(await provider.priceFor({ key: 'milk-1l', query: 'Milch' })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('HTTP 200 ohne Treffer (items=[]) -> null (nicht auf Status verlassen)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 })),
    );
    const provider = createOpenPricesProvider();
    expect(await provider.priceFor({ key: '4001234567890' })).toBeNull();
  });

  it('parst Preise (Median), castet String-Zahlen, liest Packungsinfo', async () => {
    const body = {
      total: 3,
      items: [
        {
          price: '2.49',
          currency: 'eur',
          created: '2026-07-01T10:00:00Z',
          product: { product_quantity: '1000', product_quantity_unit: 'g' },
        },
        { price: 1.99, currency: 'EUR', created: '2026-06-30T10:00:00Z' },
        { price: '3.00', currency: 'EUR', created: '2026-06-29T10:00:00Z' },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
    );
    const provider = createOpenPricesProvider();
    const res = await provider.priceFor({ key: '4001234567890' });
    expect(res).toEqual({
      pricePerPackage: 2.49, // Median von [2.49, 1.99, 3.00]
      packageSize: 1000,
      packageUnit: 'g',
      currency: 'EUR',
      source: 'open-prices',
      updatedAt: '2026-07-01T10:00:00Z',
    });
  });

  it('skaliert kg-Menge auf Gramm hoch', async () => {
    const body = {
      items: [
        {
          price: 5,
          currency: 'EUR',
          created: '2026-07-01T10:00:00Z',
          product: { product_quantity: '2', product_quantity_unit: 'kg' },
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
    );
    const provider = createOpenPricesProvider();
    const res = await provider.priceFor({ key: '4001234567890' });
    expect(res?.packageSize).toBe(2000);
    expect(res?.packageUnit).toBe('g');
  });

  it('unbrauchbare Preise (nur Strings ohne Zahl) -> null', async () => {
    const body = { items: [{ price: 'k.A.', currency: 'EUR' }] };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
    );
    const provider = createOpenPricesProvider();
    expect(await provider.priceFor({ key: '4001234567890' })).toBeNull();
  });

  it('nutzt query als Barcode, wenn key kein Barcode ist', async () => {
    const fetchSpy = vi.fn(
      async (_url: string) => new Response(JSON.stringify({ items: [] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchSpy);
    const provider = createOpenPricesProvider();
    await provider.priceFor({ key: 'milk-1l', query: '4001234567890' });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchSpy.mock.calls[0]?.[0]);
    expect(calledUrl).toContain('product_code=4001234567890');
  });
});

describe('POST /prices Route (fetch gemockt, Flag an via injizierten Provider)', () => {
  it('Flag an + Treffer -> 200 mit source "open-prices"', async () => {
    const provider: PriceProvider = { name: 'Fake', priceFor: async () => makePrice() };
    const app = createApp({
      llmClient: new MockLlmClient(defaultMockResponder),
      allowedOrigins: ['http://localhost:5173'],
      rateLimitMax: 10_000,
      pricesOnline: true,
      priceProviders: [provider],
    });
    const res = await request(app)
      .post('/prices')
      .send({ items: [{ key: '4001234567890' }] });
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({
      key: '4001234567890',
      source: 'open-prices',
      pricePerPackage: 1.99,
    });
  });
});
