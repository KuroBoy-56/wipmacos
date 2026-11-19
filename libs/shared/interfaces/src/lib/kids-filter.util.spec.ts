import { kidsBlockedName, kidsCatClass, kidsItemLevel, kidsRateKey, kidsRatePass } from './kids-filter.util';

// Ejemplos de docs/PERFILES.md del panel (sección 5): los mismos que pasan la web player y las apps de TV.
describe('perfil infantil', () => {
    it('clase de cada categoría por su nombre', () => {
        expect(kidsCatClass('INFANTILES')).toBe('kids');
        expect(kidsCatClass('ANIMADAS')).toBe('kids');
        expect(kidsCatClass('DISNEY+')).toBe('disney');
        expect(kidsCatClass('PELÍCULAS DE FAMILIA')).toBe('family');
        expect(kidsCatClass('TERROR')).toBe('block');
        expect(kidsCatClass('MARVEL')).toBe('block');
        expect(kidsCatClass('ADULTOS +18')).toBe('block');
        expect(kidsCatClass('ESTRENOS 2024')).toBe('');
        expect(kidsCatClass('ANIME INFANTIL')).toBe('kids');
        expect(kidsCatClass('INFANTILES', true)).toBe('kids');
        expect(kidsCatClass('DEPORTES', true)).toBe('');
    });

    it('nivel de cada título (tabla de ejemplos del panel)', () => {
        const level = (name: string, genre: string, cats: string[]) => kidsItemLevel(name, genre, cats.map((c) => kidsCatClass(c)));
        expect(level('Toy Story 4', '', ['INFANTILES'])).toBe('strong');
        expect(level('Shrek', 'Animación, Comedia', ['ANIMADAS'])).toBe('strong');
        expect(level('Moana 2', 'Animación, Familia', ['DISNEY+'])).toBe('strong');
        expect(level('Frozen II', '', ['DISNEY+'])).toBe('weak');
        expect(level('Mírame así, el camino de Noa', 'Comedia, Familia, Telenovela', ['SERIES NUEVAS'])).toBe('weak');
        expect(level('Rick y Morty: la película', 'Animación, Comedia', ['ANIMADAS'])).toBe('');
        expect(level('Deadpool & Wolverine', 'Acción, Comedia', ['ESTRENOS 2024'])).toBe('');
        expect(level('Thor: amor y trueno', '', ['MARVEL'])).toBe('');
        expect(level('Loki', '', ['DISNEY+'])).toBe('');
    });

    it('lo dudoso solo con el «ok» de TMDB; lo seguro salvo que TMDB diga «no»', () => {
        expect(kidsRatePass('weak', '')).toBe(false);
        expect(kidsRatePass('weak', 'ok')).toBe(true);
        expect(kidsRatePass('strong', '')).toBe(true);
        expect(kidsRatePass('strong', 'no')).toBe(false);
        expect(kidsBlockedName('Canal XXX')).toBe(true);
        expect(kidsBlockedName('Disney Channel')).toBe(false);
    });

    it('clave para TMDB por id o por nombre y año', () => {
        expect(kidsRateKey('vod', 'Toy Story 4', '2019', '301528')).toBe('m:301528');
        const k = kidsRateKey('series', 'Bluey', '2018', '');
        expect(k).toMatch(/^sn:[0-9a-f]{16}$/);
        expect(kidsRateKey('series', 'BLUEY', '2018', '')).toBe(k);
    });
});
