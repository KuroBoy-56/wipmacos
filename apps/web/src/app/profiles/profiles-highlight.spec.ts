import { addHighlights, highlightSources, resetHighlightsCache, toHighlight, weekHighlights } from './profiles-highlight';

const item = (i: number, kind = 'movie', extra: Record<string, unknown> = {}) => ({
    id: i,
    media_type: kind,
    title: `T${i}`,
    vote_average: 7.26,
    release_date: '2026-05-01',
    backdrop_path: `/b${i}.jpg`,
    ...extra,
});
const page = (from: number, count: number) => ({ results: Array.from({ length: count }, (_, k) => item(from + k)) });

function fetcher(pages: Record<number, unknown>) {
    const urls: string[] = [];
    const fn = jest.fn(async (url: string) => {
        urls.push(url);
        const n = Number(/[?&]page=(\d+)/.exec(url)?.[1]);
        const body = pages[n];
        return { ok: body !== undefined, json: async () => body } as Response;
    });
    return { fn: fn as unknown as typeof fetch, urls };
}

describe('profiles highlights (web player wp_prof_highlights)', () => {
    beforeEach(() => resetHighlightsCache());

    it('keeps only movies and series with a backdrop and a name', () => {
        expect(toHighlight(item(1))).toEqual({ id: 'movie:1', title: 'T1', rating: 7.3, year: '2026', kind: 'movie', backdrop: 'https://image.tmdb.org/t/p/original/b1.jpg' });
        expect(toHighlight(item(2, 'person'))).toBeNull();
        expect(toHighlight(item(3, 'tv', { backdrop_path: '' }))).toBeNull();
        expect(toHighlight(item(4, 'tv', { title: '', name: '' }))).toBeNull();
    });

    it('takes 15 to 20 titles without repeats, page 2 only when page 1 has fewer than 15', async () => {
        const full = fetcher({ 1: page(1, 20), 2: page(100, 20) });
        expect((await weekHighlights(full.fn)).length).toBe(20);
        expect(full.urls).toHaveLength(1);
        expect(full.urls[0]).toContain('tmdb.php?path=trending/all/week');

        resetHighlightsCache();
        const short = fetcher({ 1: { results: [...page(1, 10).results, item(1)] }, 2: page(5, 20) });
        const list = await weekHighlights(short.fn);
        expect(short.urls).toHaveLength(2);
        expect(list.length).toBe(20);
        expect(new Set(list.map((h) => h.id)).size).toBe(20);
    });

    it('does not keep an empty answer when the panel does not answer', async () => {
        const down = fetcher({});
        expect(await weekHighlights(down.fn)).toEqual([]);
        const up = fetcher({ 1: page(1, 16) });
        expect((await weekHighlights(up.fn)).length).toBe(16);
    });

    it('stops at 20 when adding', () => {
        const list: ReturnType<typeof toHighlight>[] = [];
        addHighlights(list as never, page(1, 30));
        expect(list.length).toBe(20);
    });

    it('uses TMDB w1280 + the original when the panel image cache is off', () => {
        const h = toHighlight(item(7));
        if (!h) throw new Error('no item');
        expect(highlightSources(h)).toEqual({ fhd: 'https://image.tmdb.org/t/p/w1280/b7.jpg', w: 1280, orig: 'https://image.tmdb.org/t/p/original/b7.jpg' });
    });
});
