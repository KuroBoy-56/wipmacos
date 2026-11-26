import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { fieldKind } from './live-sports.util';

/**
 * Fondo de la tarjeta en vivo, como en Android: la cancha del deporte vista desde arriba (fútbol, básquet, fútbol
 * americano, béisbol, hockey, tenis / vóley); otro deporte, un degradado oscuro. Se dibuja en SVG: sin imágenes.
 * El color de fondo va en CSS (los degradados SVG necesitan id, y se repetirían en cada tarjeta).
 */
@Component({
    selector: 'app-live-field',
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { '[class]': '"lf lf-" + (kind() || "none")', 'aria-hidden': 'true' },
    template: `
        <svg viewBox="0 0 300 172" preserveAspectRatio="xMidYMid slice" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="2.2">
            @switch (kind()) {
                @case ('soccer') {
                    @for (x of [30, 90, 150, 210, 270]; track x) {
                        <rect [attr.x]="x" y="0" width="30" height="172" fill="#388E3C" stroke="none" />
                    }
                    <rect x="14" y="14" width="272" height="144" />
                    <line x1="150" y1="14" x2="150" y2="158" />
                    <circle cx="150" cy="86" r="26" />
                    <rect x="14" y="45.5" width="35" height="81" />
                    <rect x="251" y="45.5" width="35" height="81" />
                    <rect x="14" y="67.3" width="13.6" height="37.4" />
                    <rect x="272.4" y="67.3" width="13.6" height="37.4" />
                    <g fill="#fff" stroke="none">
                        <circle cx="150" cy="86" r="3" />
                        <circle cx="38.5" cy="86" r="2.5" />
                        <circle cx="261.5" cy="86" r="2.5" />
                    </g>
                }
                @case ('basketball') {
                    @for (y of planks; track y) {
                        <line x1="0" [attr.y1]="y" x2="300" [attr.y2]="y" stroke="rgba(0,0,0,.13)" stroke-width="1" />
                    }
                    <rect x="12" y="59.4" width="52.4" height="53.3" fill="rgba(163,59,30,.33)" />
                    <rect x="235.6" y="59.4" width="52.4" height="53.3" fill="rgba(163,59,30,.33)" />
                    <rect x="12" y="12" width="276" height="148" />
                    <line x1="150" y1="12" x2="150" y2="160" />
                    <circle cx="150" cy="86" r="25" />
                    <path d="M12 18 A68 68 0 0 1 12 154" />
                    <path d="M288 18 A68 68 0 0 0 288 154" />
                    <g fill="#fff" stroke="none">
                        <circle cx="25.8" cy="86" r="3" />
                        <circle cx="274.2" cy="86" r="3" />
                    </g>
                }
                @case ('american') {
                    <rect x="12" y="12" width="22" height="148" fill="#1B5E20" stroke="none" />
                    <rect x="266" y="12" width="22" height="148" fill="#1B5E20" stroke="none" />
                    <rect x="12" y="12" width="276" height="148" />
                    @for (x of yards; track x; let i = $index) {
                        <line [attr.x1]="x" y1="12" [attr.x2]="x" y2="160" [attr.stroke-width]="i === 5 ? 2.6 : 1.6" />
                    }
                    <!-- marcas de cada yarda -->
                    <line x1="34" y1="65.3" x2="266" y2="65.3" stroke="rgba(255,255,255,.55)" stroke-width="6" stroke-dasharray="1 3.64" />
                    <line x1="34" y1="106.7" x2="266" y2="106.7" stroke="rgba(255,255,255,.55)" stroke-width="6" stroke-dasharray="1 3.64" />
                }
                @case ('baseball') {
                    <path d="M150 164 L78.8 99.4 Q150 6.5 221.2 99.4 Z" fill="#B9773C" stroke="none" />
                    <path d="M150 158.2 L211.9 96.3 L150 34.4 L88.1 96.3 Z" fill="#43A047" stroke-width="2" />
                    <line x1="150" y1="158.2" x2="450" y2="-141.8" stroke-width="2" />
                    <line x1="150" y1="158.2" x2="-150" y2="-141.8" stroke-width="2" />
                    <circle cx="150" cy="96.3" r="9.9" fill="#B9773C" stroke="none" />
                    <g fill="#fff" stroke="none">
                        <rect x="207.9" y="92.3" width="8" height="8" />
                        <rect x="146" y="30.4" width="8" height="8" />
                        <rect x="84.1" y="92.3" width="8" height="8" />
                        <rect x="146" y="154.2" width="8" height="8" />
                    </g>
                }
                @case ('hockey') {
                    <rect x="12" y="12" width="276" height="148" rx="44.4" stroke-width="2.4" />
                    <line x1="150" y1="12" x2="150" y2="160" stroke="#D32F2F" stroke-width="4" />
                    <line x1="103.1" y1="12" x2="103.1" y2="160" stroke="#1565C0" stroke-width="4" />
                    <line x1="196.9" y1="12" x2="196.9" y2="160" stroke="#1565C0" stroke-width="4" />
                    <line x1="31.3" y1="25.3" x2="31.3" y2="146.7" stroke="#D32F2F" stroke-width="2" />
                    <line x1="268.7" y1="25.3" x2="268.7" y2="146.7" stroke="#D32F2F" stroke-width="2" />
                    <circle cx="150" cy="86" r="22.2" stroke="#1565C0" stroke-width="2" />
                    @for (p of faceoffs; track $index) {
                        <circle [attr.cx]="p[0]" [attr.cy]="p[1]" r="17.8" stroke="#D32F2F" stroke-width="1.6" />
                        <circle [attr.cx]="p[0]" [attr.cy]="p[1]" r="3" fill="#D32F2F" stroke="none" />
                    }
                }
                @case ('court') {
                    <rect x="27.5" y="17.2" width="245" height="137.6" fill="#2F5C8A" />
                    <line x1="27.5" y1="33.7" x2="272.5" y2="33.7" stroke-width="2" />
                    <line x1="27.5" y1="138.3" x2="272.5" y2="138.3" stroke-width="2" />
                    <line x1="93.6" y1="33.7" x2="93.6" y2="138.3" stroke-width="2" />
                    <line x1="206.4" y1="33.7" x2="206.4" y2="138.3" stroke-width="2" />
                    <line x1="93.6" y1="86" x2="206.4" y2="86" stroke-width="2" />
                    <line x1="150" y1="10.3" x2="150" y2="161.7" stroke="#fff" stroke-width="3.5" />
                }
            }
        </svg>
    `,
    styles: `
        :host { position: absolute; inset: 0; display: block; background: linear-gradient(135deg, #232b3a, #0e1118); }
        svg { width: 100%; height: 100%; display: block; }
        :host(.lf-soccer) { background: #2e7d32; }
        :host(.lf-basketball) { background: linear-gradient(90deg, #c9803f, #d99252, #c9803f); }
        :host(.lf-american) { background: #2f7d32; }
        :host(.lf-baseball) { background: radial-gradient(circle at 50% 100%, #43a047, #2e7d32 75%); }
        /* hielo un poco oscurecido: los nombres en blanco se leen encima */
        :host(.lf-hockey) { background: linear-gradient(180deg, #8fa6bc, #6d879f); }
        :host(.lf-court) { background: #2e6e4e; }
    `,
})
export class LiveFieldComponent {
    readonly sport = input('');
    protected readonly kind = computed(() => fieldKind(this.sport()));
    protected readonly planks = Array.from({ length: 13 }, (_, i) => (172 * (i + 1)) / 14);
    protected readonly yards = Array.from({ length: 11 }, (_, i) => 34 + 23.2 * i);
    protected readonly faceoffs = [
        [61.7, 53.4],
        [61.7, 118.6],
        [238.3, 53.4],
        [238.3, 118.6],
    ];
}
