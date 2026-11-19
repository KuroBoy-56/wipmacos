/** Perfiles como Netflix (api/profiles.php del panel; contrato en docs/PERFILES.md del panel). */
export interface Profile {
    id: string;
    name: string;
    avatar: string;
    locked: boolean;
    main: boolean;
    kids: boolean;
}

export interface ProfilesData {
    /** el dueño los encendió en el panel (false también en una línea DEMO) */
    enabled: boolean;
    /** conexiones de la línea (máximo 5): con 1 no hay pantalla de perfiles */
    max: number;
    profiles: Profile[];
    canCreate: boolean;
    avatars: string[];
    kidsRules: unknown;
}

export type ProfileResult = { ok: true; data: ProfilesData } | { ok: false; error: string; code: string };

const str = (v: unknown): string => (v == null ? '' : String(v));

/** Respuesta del panel (GET o una acción) → datos; null si no es una respuesta correcta. */
export function parseProfiles(j: unknown): ProfilesData | null {
    const body = j as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || body['success'] !== true) return null;
    if (body['enabled'] !== true) return { enabled: false, max: 1, profiles: [], canCreate: false, avatars: [], kidsRules: null };
    const list = Array.isArray(body['profiles']) ? (body['profiles'] as Record<string, unknown>[]) : [];
    return {
        enabled: true,
        max: Math.max(1, Number(body['max']) || 1),
        profiles: list
            .filter((p) => p && str(p['id']))
            .map((p) => ({
                id: str(p['id']),
                name: str(p['name']),
                avatar: str(p['avatar']),
                locked: p['locked'] === true,
                main: p['main'] === true || str(p['id']) === 'main',
                kids: p['kids'] === true,
            })),
        canCreate: body['canCreate'] === true,
        avatars: (Array.isArray(body['avatars']) ? body['avatars'] : []).map(str).filter(Boolean),
        kidsRules: body['kidsRules'] ?? null,
    };
}
