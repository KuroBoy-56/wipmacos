/**
 * Perfil elegido (perfiles del panel, docs/PERFILES.md): va como «profile» en cada llamada a api/progress.php. '' o
 * 'main' = el principal (los archivos de siempre). Lo fija ProfilesService; PanelProgressClient lo lee.
 */
let current = '';
let goneHandler: (id: string) => void = () => undefined;

export function setPanelProfile(id: string): void {
    current = id === 'main' ? '' : id;
}

export function panelProfile(): string {
    return current;
}

/** El panel contestó 410 profile_gone: ese perfil ya no existe (eliminado en otro equipo). */
export function onPanelProfileGone(fn: (id: string) => void): void {
    goneHandler = fn;
}

export function reportPanelProfileGone(id: string): void {
    if (id && id === current) goneHandler(id);
}
