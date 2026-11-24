import { TmdbApiService } from './tmdb-api.service';

describe('TmdbApiService match language', () => {
    const calls: URL[] = [];
    const reply = (url: URL) =>
        url.pathname.endsWith('/recommendations')
            ? { results: [{ id: 2, title: 'El club de la pelea' }] }
            : url.pathname.endsWith('/combined_credits')
              ? { cast: [{ id: 3, title: 'Siete pecados capitales' }] }
              : {
                    id: 1,
                    recommendations: { results: [{ id: 2, title: 'Fight Club' }] },
                    combined_credits: { cast: [{ id: 3, title: 'Se7en' }] },
                };

    beforeEach(() => {
        calls.length = 0;
        global.fetch = jest.fn(async (u: string) => {
            const url = new URL(u);
            calls.push(url);
            return { ok: true, json: async () => reply(url) } as Response;
        }) as typeof fetch;
    });

    it('keeps "similar" titles in es-MX when details come in another language', async () => {
        const d = await new TmdbApiService().getMovieDetails(1, 'en-US', 'k');
        expect(d.recommendations?.results?.[0].title).toBe('El club de la pelea');
        // details in the app language, then the "Similares" pool in es-MX: recommendations (2 pages) + similar
        expect(calls.map((c) => c.searchParams.get('language'))).toEqual(['en-US', 'es-MX', 'es-MX', 'es-MX']);
        expect(calls.slice(1).map((c) => c.pathname.split('/').pop())).toEqual(['recommendations', 'recommendations', 'similar']);
    });

    it('keeps the actor filmography in es-MX', async () => {
        const p = await new TmdbApiService().getPersonDetails(9, 'fr-FR', 'k');
        expect(p.combined_credits?.cast?.[0].title).toBe('Siete pecados capitales');
    });

    it('in es-MX the details already bring page 1: only page 2 and "similar" are added', async () => {
        await new TmdbApiService().getTvDetails(1, 'es-MX', 'k');
        expect(calls).toHaveLength(3);
        expect(calls.slice(1).map((c) => `${c.pathname.split('/').pop()}:${c.searchParams.get('page')}`)).toEqual([
            'recommendations:2',
            'similar:1',
        ]);
    });

    it('asks the panel when the key is the panel one, and TMDB with a key typed by the user', async () => {
        localStorage.setItem('panel_tmdb_key', 'pk');
        try {
            await new TmdbApiService().getTvDetails(1, 'es-MX', 'pk');
            expect(calls[0].pathname.endsWith('/tmdb.php')).toBe(true);
            expect(calls[0].searchParams.get('path')).toBe('tv/1');
            expect(calls[0].searchParams.get('api_key')).toBeNull();
            calls.length = 0;
            await new TmdbApiService().getTvDetails(1, 'es-MX', 'mine');
            expect(calls[0].host).toBe('api.themoviedb.org');
        } finally {
            localStorage.removeItem('panel_tmdb_key');
        }
    });
});
