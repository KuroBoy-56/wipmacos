/**
 * Botón Autodemo del login. Con el tema de prueba encendido es el Auto-Demo del tema; si no, solo cuando el panel
 * dice que hay una demo configurada (acción features). Sin respuesta de features: la demo del distribuidor
 * (tenant_config, null con Omitir); con Omitir y sin respuesta, no hay botón.
 */
export function showsAutoDemo(s: {
    blocked: boolean;
    review: boolean;
    panelDemo: boolean | null;
    distributorDemo: boolean | null;
}): boolean {
    if (s.blocked) return false;
    if (s.review) return true;
    return s.panelDemo ?? s.distributorDemo ?? false;
}
