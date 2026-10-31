/**
 * Preliminary, NON-AUDITED search-index market sample.
 *
 * This is not a verified list of active ads. Indexed catalog pages often include
 * multiple price/KM snippets under the same URL; we may treat distinct snippets
 * as observations, not as independent confirmed sellers.
 *
 * To avoid false precision, a lone observation from a preferred portal never
 * takes priority over several observations on a backup portal.
 */
export type IndexedPortal = 'webmotors' | 'olx' | 'napista';
export interface IndexedSnippet {
  price: string;
  km: string;
  url: string;
  catalog?: boolean;
}

export const MIN_INDEXED_OBSERVATIONS = 2;

const numeric = (input: string) =>
  Number(String(input || '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;

const dedupeSnippets = <T extends IndexedSnippet>(input: T[]): T[] => {
  const sorted = [...input]
    .filter(a => numeric(a.price) > 0 && numeric(a.km) > 0)
    .sort((a, b) => numeric(a.price) - numeric(b.price));
  const distinct: T[] = [];
  for (const candidate of sorted) {
    // A re-index of virtually the same price and mileage from the same page
    // must not count as an extra comparable, especially on catalog pages.
    const repeated = distinct.some(item =>
      item.url === candidate.url &&
      Math.abs(numeric(item.price) - numeric(candidate.price)) <= 250 &&
      Math.abs(numeric(item.km) - numeric(candidate.km)) <= 250
    );
    if (!repeated) distinct.push(candidate);
  }
  return distinct;
};

export interface IndexedMarketSelection<T extends IndexedSnippet> {
  source: IndexedPortal | '';
  sample: T[];
  average: number;
  counts: Record<IndexedPortal, number>;
  fallback: boolean;
  isUnverified: true;
  sampleContainsCatalogPages: boolean;
}

export function chooseIndexedMarketSample<T extends IndexedSnippet>(
  input: Record<IndexedPortal, T[]>
): IndexedMarketSelection<T> {
  const pools: Record<IndexedPortal, T[]> = {
    webmotors: dedupeSnippets(input.webmotors || []),
    olx: dedupeSnippets(input.olx || []),
    napista: dedupeSnippets(input.napista || [])
  };
  const counts = {
    webmotors: pools.webmotors.length,
    olx: pools.olx.length,
    napista: pools.napista.length
  };

  // Prefer Webmotors with a usable sample, followed by OLX and NaPista.
  // One NaPista entry must NEVER override a larger OLX set.
  const source: IndexedPortal | '' =
    (['webmotors', 'olx', 'napista'] as IndexedPortal[])
      .find(portal => pools[portal].length >= MIN_INDEXED_OBSERVATIONS) || '';
  const sample = source ? pools[source].slice(0, 5) : [];
  const average = sample.length
    ? sample.reduce((sum, a) => sum + numeric(a.price), 0) / sample.length : 0;

  return {
    source, sample, average, counts,
    fallback: Boolean(source && source !== 'webmotors'),
    isUnverified: true,
    sampleContainsCatalogPages: sample.some(a => Boolean(a.catalog))
  };
}
