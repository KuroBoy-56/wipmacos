/**
 * Perfil infantil (docs/PERFILES.md del panel, sección 5): solo contenido para niños y de Disney. Mismo algoritmo que la
 * web player (includes/kids.php) y las apps de TV (src/lib/kids.ts): la clase de cada categoría por su nombre, el nivel
 * de cada película o serie (seguro / dudoso / fuera) y, para lo dudoso, el visto bueno de TMDB (api/kids_rate.php).
 * Funciones puras: el estado (perfil infantil activo, veredictos) vive en KidsFilterService.
 */
import { KIDS_RULES_LOCAL } from './kids-rules';

export type KidsRules = { v: number; rate_age_max?: number } & Record<string, unknown>;
type Lists = 'kids' | 'family' | 'live' | 'disney' | 'block_cats' | 'kids_strong' | 'genre_kids' | 'genre_weak' | 'genre_anim' | 'genre_hard' | 'genre_block' | 'block_marks' | 'block_titles' | 'kids_titles';
export type KidsCatClass = 'block' | 'kids' | 'disney' | 'family' | '';
/** 'strong' se ve salvo que TMDB diga 'no'; 'weak' solo si TMDB dice 'ok'; '' nunca */
export type KidsLevel = 'strong' | 'weak' | '';

const RULES_KEY = 'kids_rules';
const ACCENTS: Record<string, string> = { á: 'a', à: 'a', ä: 'a', â: 'a', ã: 'a', é: 'e', è: 'e', ë: 'e', ê: 'e', í: 'i', ì: 'i', ï: 'i', î: 'i', ó: 'o', ò: 'o', ö: 'o', ô: 'o', õ: 'o', ú: 'u', ù: 'u', ü: 'u', û: 'u', ñ: 'n', ç: 'c' };

/** minúsculas y sin acentos (las listas ya vienen así) */
export function kidsFold(text: unknown): string {
    return String(text ?? '').toLowerCase().replace(/[áàäâãéèëêíìïîóòöôõúùüûñç]/g, (c) => ACCENTS[c] || c);
}

function valid(r: unknown): r is KidsRules {
    const x = r as KidsRules | null;
    return !!x && typeof x === 'object' && Number(x.v) > 0 && Array.isArray(x['kids']) && Array.isArray(x['block_cats']);
}

let rules: KidsRules = KIDS_RULES_LOCAL;
let compiled: Partial<Record<Lists, RegExp | null>> = {};
// nombre → ¿está en kids_titles? (el catálogo infantil se vuelve a armar cuando llegan veredictos de TMDB)
let titleMemo = new Map<string, boolean>();

function use(r: KidsRules): void {
    if (r === rules) return;
    rules = r;
    compiled = {};
    titleMemo = new Map();
}

// ¿el nombre (ya normalizado) es de un título de niños de kids_titles (v3: Shrek, Toy Story, Paw Patrol…)?
function kidsTitle(n: string): boolean {
    let v = titleMemo.get(n);
    if (v === undefined) {
        v = m(n, 'kids_titles');
        titleMemo.set(n, v);
    }
    return v;
}

/** Las del panel, si son más nuevas (v) que las guardadas y que la copia de fábrica. */
export function rememberKidsRules(r: unknown): void {
    if (!valid(r)) return;
    const saved = readSavedRules();
    const best = [KIDS_RULES_LOCAL, saved, r].filter((x): x is KidsRules => !!x).sort((a, b) => Number(b.v) - Number(a.v))[0];
    if (best === r) {
        try {
            localStorage.setItem(RULES_KEY, JSON.stringify(r));
        } catch {
            // sin almacenamiento: valen hasta cerrar la app
        }
    }
    use(best);
}

/** Las guardadas (o la copia de fábrica) al entrar a un perfil infantil. */
export function loadKidsRules(): void {
    const saved = readSavedRules();
    use(saved && Number(saved.v) > KIDS_RULES_LOCAL.v ? saved : KIDS_RULES_LOCAL);
}

function readSavedRules(): KidsRules | null {
    try {
        const r = JSON.parse(localStorage.getItem(RULES_KEY) || 'null');
        return valid(r) ? r : null;
    } catch {
        return null;
    }
}

export function kidsRulesVersion(): number {
    return Number(rules.v) || 0;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** cada lista como una sola expresión; «/…/» es una expresión regular, lo demás «contiene» */
function listRx(list: Lists): RegExp | null {
    if (list in compiled) return compiled[list] ?? null;
    const parts: string[] = [];
    const entries = rules[list];
    for (const e of Array.isArray(entries) ? entries : []) {
        const v = String(e ?? '');
        if (!v) continue;
        const isRx = v.length > 2 && v.startsWith('/') && v.endsWith('/');
        const part = isRx ? '(?:' + v.slice(1, -1) + ')' : escape(kidsFold(v));
        try {
            new RegExp(part);
            parts.push(part);
        } catch {
            // una entrada que este equipo no entiende se salta
        }
    }
    return (compiled[list] = parts.length ? new RegExp(parts.join('|')) : null);
}

function m(text: string, list: Lists): boolean {
    const r = listRx(list);
    return !!r && !!text && r.test(text);
}

export function kidsCatClass(name: unknown, live = false): KidsCatClass {
    const n = kidsFold(name);
    if (!n) return '';
    if (!m(n, 'kids_strong') && m(n, 'block_cats')) return 'block';
    if (m(n, live ? 'live' : 'kids')) return 'kids';
    if (!live && m(n, 'disney')) return 'disney';
    if (!live && m(n, 'family')) return 'family';
    return '';
}

/** un canal de una categoría de niños que igual no se muestra (+18, XXX…) */
export function kidsBlockedName(name: unknown): boolean {
    return m(kidsFold(name), 'block_marks');
}

export function kidsItemLevel(name: unknown, genre: unknown, classes: readonly KidsCatClass[]): KidsLevel {
    let kidsCat = false;
    let weakCat = false;
    for (const k of classes) {
        if (k === 'block') return '';
        if (k === 'kids') kidsCat = true;
        else if (k === 'disney' || k === 'family') weakCat = true;
    }
    const n = kidsFold(name);
    if (m(n, 'block_marks') || m(n, 'block_titles')) return '';
    const g = kidsFold(genre).trim();
    const has = (l: Lists) => !!g && m(g, l);
    const gWeak = has('genre_weak');
    const gAnim = has('genre_anim');
    const kidsGenre = has('genre_kids') || (gWeak && gAnim);
    const gHard = has('genre_hard');
    const gBlock = has('genre_block');
    // título de niños (kids_titles, v3) fuera de una categoría de niños: solo sin género o con género de niños, familia o
    // animación, o en una categoría de Disney o familia (son cientos de títulos: así es rápido)
    const tKids = !kidsCat && (!g || kidsGenre || gWeak || gAnim || weakCat) && kidsTitle(n);
    // crimen, terror, telenovela… sin nada de niños ni de familia: fuera
    if (gBlock && !kidsGenre && !gWeak && !tKids) return '';
    if ((kidsCat || kidsGenre || tKids) && !gHard && !gBlock) return 'strong';
    return kidsCat || kidsGenre || tKids || weakCat || gWeak ? 'weak' : '';
}

export function kidsRatePass(level: KidsLevel, verdict: string): boolean {
    if (!level || verdict === 'no') return false;
    return level === 'strong' || verdict === 'ok';
}

/** clave del título para api/kids_rate.php: su id de TMDB o, sin él, el nombre y el año (vuelve igual del panel) */
export function kidsRateKey(kind: 'vod' | 'series', name: unknown, year: unknown, tmdb: unknown): string {
    const t = kind === 'series' ? 's' : 'm';
    const id = String(tmdb ?? '');
    if (/^[1-9]\d{0,8}$/.test(id)) return t + ':' + id;
    return t + 'n:' + hash16(kidsFold(name) + '|' + String(year ?? ''));
}

/** FNV-1a de 32 bits dos veces: 16 caracteres, igual que las apps de TV */
function hash16(s: string): string {
    let a = 0x811c9dc5;
    let b = 0x01000193 ^ 0x5bd1e995;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        a = Math.imul(a ^ c, 0x01000193) >>> 0;
        b = Math.imul(b ^ c, 0x01000193) >>> 0;
    }
    return ('0000000' + a.toString(16)).slice(-8) + ('0000000' + b.toString(16)).slice(-8);
}
