import { DatePipe } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';
import { EpgProgram } from '@iptvnator/shared/interfaces';
import { signal } from '@angular/core';
import { PanelBrandingService } from '@iptvnator/services';
import { ChannelListItemComponent } from './channel-list-item.component';

describe('ChannelListItemComponent', () => {
    let fixture: ComponentFixture<ChannelListItemComponent>;
    let dialog: { open: jest.Mock };
    const branding = {
        choice: signal<'none' | 'skip' | 'code'>('skip'),
        logoUrl: signal<string | null>(null),
    };

    beforeEach(async () => {
        dialog = {
            open: jest.fn(),
        };

        await TestBed.configureTestingModule({
            imports: [
                ChannelListItemComponent,
                NoopAnimationsModule,
                TranslateModule.forRoot(),
            ],
            providers: [
                {
                    provide: MatDialog,
                    useValue: dialog,
                },
                { provide: PanelBrandingService, useValue: branding },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(ChannelListItemComponent);
    });

    it('formats preview times from timestamp fields when raw strings are offset', () => {
        const startTimestamp = Math.floor(
            Date.parse('2026-04-05T05:30:00.000Z') / 1000
        );
        const stopTimestamp = Math.floor(
            Date.parse('2026-04-05T06:00:00.000Z') / 1000
        );
        const program: EpgProgram = {
            start: '2026-04-05 03:00:00',
            stop: '2026-04-05 03:30:00',
            channel: 'channel-1',
            title: 'Current Show',
            desc: 'Current description',
            category: null,
            startTimestamp,
            stopTimestamp,
        };

        fixture.componentRef.setInput('name', 'Cartoon Network');
        fixture.componentRef.setInput('epgProgram', program);
        fixture.componentRef.setInput('showProgramInfoButton', false);
        fixture.detectChanges();

        const times = Array.from(
            fixture.nativeElement.querySelectorAll('.epg-time'),
            (element: Element) => element.textContent?.trim() ?? ''
        );
        const datePipe = new DatePipe('en-US');

        expect(times).toEqual([
            datePipe.transform(startTimestamp * 1000, 'HH:mm') ?? '',
            datePipe.transform(stopTimestamp * 1000, 'HH:mm') ?? '',
        ]);
    });

    it('hides the no-program placeholder for radio items without EPG data', () => {
        fixture.componentRef.setInput('name', 'Radio One');
        fixture.componentRef.setInput('showEpg', true);
        fixture.componentRef.setInput('isRadio', true);
        fixture.detectChanges();

        expect(
            fixture.nativeElement.querySelector('.epg-placeholder')
        ).toBeNull();
    });

    const brandSrc = () =>
        (fixture.nativeElement.querySelector('.channel-logo-brand') as HTMLImageElement | null)?.getAttribute('src') ?? null;

    it('shows the app logo for a channel without logo when there is no distributor', () => {
        branding.choice.set('skip');
        branding.logoUrl.set(null);
        fixture.componentRef.setInput('name', 'Channel Without Logo');
        fixture.componentRef.setInput('logo', '');
        fixture.detectChanges();

        expect(brandSrc()).toBe('assets/images/logo.png');
        expect(fixture.nativeElement.querySelector('.channel-logo-fallback')).toBeNull();
    });

    it('shows the distributor logo (never the app logo) for a channel without logo', () => {
        branding.choice.set('code');
        branding.logoUrl.set('https://panel.example/img/tenants/5/logo_1.png');
        fixture.componentRef.setInput('name', 'Channel Without Logo');
        fixture.componentRef.setInput('logo', '');
        fixture.detectChanges();

        expect(brandSrc()).toBe('https://panel.example/img/tenants/5/logo_1.png');
    });

    it('shows the generic icon when the distributor has no logo', () => {
        branding.choice.set('code');
        branding.logoUrl.set(null);
        fixture.componentRef.setInput('name', 'Channel Without Logo');
        fixture.componentRef.setInput('logo', '');
        fixture.detectChanges();

        expect(brandSrc()).toBeNull();
        expect(
            fixture.nativeElement.querySelector('.channel-logo-fallback')
        ).not.toBeNull();
        expect(fixture.nativeElement.querySelector('.channel-logo')).toBeNull();
    });

    it('emits clicked on a single click by default', () => {
        const clicked = jest.fn();
        fixture.componentInstance.clicked.subscribe(clicked);

        fixture.componentInstance.onClick({ detail: 1 } as MouseEvent);

        expect(clicked).toHaveBeenCalledTimes(1);
    });

    it('suppresses the second browser click and emits activation on double click', () => {
        const clicked = jest.fn();
        const activated = jest.fn();
        fixture.componentInstance.clicked.subscribe(clicked);
        fixture.componentInstance.activated.subscribe(activated);

        fixture.componentInstance.onClick({ detail: 1 } as MouseEvent);
        fixture.componentInstance.onClick({ detail: 2 } as MouseEvent);
        fixture.componentInstance.onDoubleClick();

        expect(clicked).toHaveBeenCalledTimes(1);
        expect(activated).toHaveBeenCalledTimes(1);
    });

    it('emits a context menu request on right click when details are enabled', () => {
        fixture.componentRef.setInput('name', 'News One');
        fixture.componentRef.setInput('showDetailsContextMenu', true);
        fixture.detectChanges();

        const preventDefault = jest.fn();
        const stopPropagation = jest.fn();
        const contextMenuRequested = jest.fn();

        fixture.componentInstance.contextMenuRequested.subscribe(
            contextMenuRequested
        );

        fixture.componentInstance.onContextMenu({
            clientX: 120,
            clientY: 56,
            preventDefault,
            stopPropagation,
        } as unknown as MouseEvent);

        expect(preventDefault).toHaveBeenCalled();
        expect(stopPropagation).toHaveBeenCalled();
        expect(contextMenuRequested).toHaveBeenCalledWith(
            expect.objectContaining({
                clientX: 120,
                clientY: 56,
            })
        );
    });
});
