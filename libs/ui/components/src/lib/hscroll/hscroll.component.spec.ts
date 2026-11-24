import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HScrollComponent } from './hscroll.component';

@Component({
    standalone: true,
    imports: [HScrollComponent],
    template: `<app-hscroll
        ><div class="row"><span>a</span></div></app-hscroll
    >`,
})
class HostComponent {}

describe('HScrollComponent (mouse arrows on horizontal rows)', () => {
    function setup(
        scrollLeft: number,
        clientWidth: number,
        scrollWidth: number
    ) {
        TestBed.configureTestingModule({ imports: [HostComponent] });
        const fixture = TestBed.createComponent(HostComponent);
        const row = fixture.nativeElement.querySelector('.row') as HTMLElement;
        Object.defineProperty(row, 'clientWidth', {
            configurable: true,
            value: clientWidth,
        });
        Object.defineProperty(row, 'scrollWidth', {
            configurable: true,
            value: scrollWidth,
        });
        row.scrollLeft = scrollLeft;
        Object.defineProperty(row, 'scrollLeft', {
            configurable: true,
            writable: true,
            value: scrollLeft,
        });
        fixture.detectChanges();
        const cmp = fixture.debugElement.children[0]
            .componentInstance as HScrollComponent;
        cmp.update();
        fixture.detectChanges();
        return { fixture, row, cmp };
    }

    it('shows only the right arrow at the start of a long row', () => {
        const { fixture } = setup(0, 300, 900);
        expect(fixture.nativeElement.querySelector('.hs-arrow.l')).toBeNull();
        expect(
            fixture.nativeElement.querySelector('.hs-arrow.r')
        ).not.toBeNull();
    });

    it('shows both arrows in the middle and none when everything fits', () => {
        expect(setup(200, 300, 900).cmp.canLeft()).toBe(true);
        TestBed.resetTestingModule();
        const fits = setup(0, 300, 300).cmp;
        expect(fits.canLeft()).toBe(false);
        expect(fits.canRight()).toBe(false);
    });

    it('moves the row by most of its width', () => {
        const { row, cmp } = setup(0, 300, 900);
        row.scrollBy = jest.fn();
        cmp.go(1);
        expect(row.scrollBy).toHaveBeenCalledWith({
            left: 240,
            behavior: 'smooth',
        });
    });
});
