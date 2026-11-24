import {
    AfterViewInit,
    ChangeDetectionStrategy,
    Component,
    ElementRef,
    OnDestroy,
    inject,
    signal,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Wraps one horizontal scroller (its only element child) and adds a left / right arrow for PCs with a mouse
 * and no touchpad: the arrows show on hover with a mouse (hover + fine pointer, never with touch or pen) and
 * only on the side that can still move. The wheel keeps scrolling the page.
 */
@Component({
    selector: 'app-hscroll',
    standalone: true,
    imports: [MatIconModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <ng-content />
        @if (canLeft()) {
            <button
                type="button"
                class="hs-arrow l"
                tabindex="-1"
                aria-hidden="true"
                (click)="go(-1)"
            >
                <mat-icon>chevron_left</mat-icon>
            </button>
        }
        @if (canRight()) {
            <button
                type="button"
                class="hs-arrow r"
                tabindex="-1"
                aria-hidden="true"
                (click)="go(1)"
            >
                <mat-icon>chevron_right</mat-icon>
            </button>
        }
    `,
    styles: [
        `
            :host {
                display: block;
                position: relative;
                min-width: 0;
            }
            .hs-arrow {
                position: absolute;
                top: 50%;
                z-index: 7;
                width: 40px;
                height: 40px;
                margin-top: -20px;
                padding: 0;
                border: 1px solid rgba(255, 255, 255, 0.25);
                border-radius: 50%;
                background: rgba(20, 20, 20, 0.82);
                color: #fff;
                cursor: pointer;
                display: none;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 12px rgba(0, 0, 0, 0.6);
                opacity: 0;
                transition:
                    opacity 0.2s,
                    transform 0.15s;
            }
            .hs-arrow:hover {
                transform: scale(1.12);
            }
            .hs-arrow.l {
                left: 4px;
            }
            .hs-arrow.r {
                right: 4px;
            }
            @media (hover: hover) and (pointer: fine) {
                .hs-arrow {
                    display: flex;
                }
                :host(:hover) .hs-arrow {
                    opacity: 1;
                }
            }
            :host-context(html[data-input='touch']) .hs-arrow,
            :host-context(html[data-input='pen']) .hs-arrow {
                display: none;
            }
        `,
    ],
    host: {
        '(mouseenter)': 'update()',
    },
})
export class HScrollComponent implements AfterViewInit, OnDestroy {
    private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
    readonly canLeft = signal(false);
    readonly canRight = signal(false);
    private scroller: HTMLElement | null = null;
    private resize: ResizeObserver | null = null;
    private readonly onScroll = () => this.update();

    ngAfterViewInit(): void {
        this.scroller = Array.from(this.host.nativeElement.children).find(
            (el) => !el.classList.contains('hs-arrow')
        ) as HTMLElement | null;
        if (!this.scroller) return;
        this.scroller.addEventListener('scroll', this.onScroll, {
            passive: true,
        });
        if (typeof ResizeObserver !== 'undefined') {
            this.resize = new ResizeObserver(this.onScroll);
            this.resize.observe(this.scroller);
        }
        this.update();
    }

    update(): void {
        const s = this.scroller;
        if (!s) return;
        this.canLeft.set(s.scrollLeft > 4);
        this.canRight.set(s.scrollLeft + s.clientWidth < s.scrollWidth - 4);
    }

    go(dir: 1 | -1): void {
        const s = this.scroller;
        if (!s) return;
        s.scrollBy({
            left: dir * Math.max(160, s.clientWidth * 0.8),
            behavior: 'smooth',
        });
    }

    ngOnDestroy(): void {
        this.scroller?.removeEventListener('scroll', this.onScroll);
        this.resize?.disconnect();
    }
}
