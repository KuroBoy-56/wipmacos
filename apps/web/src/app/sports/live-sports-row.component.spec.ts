import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { PanelLiveEvent } from '@iptvnator/services';
import { LiveSportsRowComponent } from './live-sports-row.component';
import { LiveSportsService } from './live-sports.service';
import { LiveCard } from './live-sports.util';
import { SportsDataService } from './sports-data.service';

const ch = (streamId: string, name: string) => ({ streamId, categoryId: '7', name, partial: false, playlistId: 'pl' });
const ev: PanelLiveEvent = {
    id: '99', sp: 'Soccer', lg: 'UEFA Champions League', lb: '', ev: '', h: 'Real Madrid', a: 'Barcelona', hb: '', ab: '', hs: '2', as: '1',
    ts: '', v: '', st: '2H', th: '', pp: false, pr: '67',
};

describe('LiveSportsRowComponent (Inicio › En vivo ahora)', () => {
    async function render(cards: LiveCard[]) {
        const navigate = jest.fn().mockResolvedValue(true);
        const searchChannels = jest.fn().mockResolvedValue([ch('50', 'Real Madrid TV')]);
        const live = { cards: signal(cards), lastId: '' };
        await TestBed.configureTestingModule({
            imports: [LiveSportsRowComponent, TranslateModule.forRoot()],
            providers: [
                { provide: LiveSportsService, useValue: live },
                { provide: SportsDataService, useValue: { searchChannels } },
                { provide: Router, useValue: { navigate } },
                { provide: MatSnackBar, useValue: { open: jest.fn() } },
            ],
        }).compileComponents();
        const fixture = TestBed.createComponent(LiveSportsRowComponent);
        fixture.detectChanges();
        return { fixture, el: fixture.nativeElement as HTMLElement, navigate, searchChannels, live };
    }

    it('draws nothing without matches (the platforms are gone, nothing takes their place)', async () => {
        const { el } = await render([]);
        expect(el.querySelector('.lv')).toBeNull();
    });

    it('shows the card with the field, score, minute and the client channel', async () => {
        const { el } = await render([{ e: ev, ch: { tv: [], epg: [], teams: null, best: ch('10', 'ESPN') } }]);
        expect(el.querySelector('app-live-field')?.classList).toContain('lf-soccer');
        expect(el.querySelector('.lv-theme')).not.toBeNull();
        expect(el.querySelector('.lv-score')?.textContent?.replace(/\s/g, '')).toBe('2-1');
        expect(el.querySelector('.lv-clock')?.textContent?.trim()).toBe("67'");
        expect(el.querySelector('.lv-ch')?.textContent).toContain('ESPN');
    });

    it('opens the menu with only the client channels and plays the chosen one in TV en vivo', async () => {
        const m = { tv: [{ n: 'ESPN', c: 'MX', ch: ch('10', 'ESPN') }, { n: 'Fox', c: '', ch: null }], epg: [ch('11', 'ESPN 2')], teams: null, best: ch('10', 'ESPN') };
        const { el, fixture, navigate, live } = await render([{ e: ev, ch: m }]);
        (el.querySelector('.lv-card') as HTMLButtonElement).click();
        fixture.detectChanges();
        const opts = Array.from(el.querySelectorAll('.lv-opts button b')).map((b) => b.textContent?.trim());
        expect(opts).toContain('ESPN');
        expect(opts.some((o) => o?.startsWith('ESPN 2'))).toBe(true);
        expect(opts.some((o) => o?.includes('Fox'))).toBe(false);
        (el.querySelector('.lv-opts button.primary') as HTMLButtonElement).click();
        await fixture.whenStable();
        expect(navigate).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(navigate.mock.calls[0])).toContain('10');
        expect(live.lastId).toBe('99');
        fixture.detectChanges();
        expect(el.querySelector('.lv-menu')).toBeNull();
    });

    it('searches the client channels by team', async () => {
        const { el, fixture, searchChannels } = await render([{ e: ev, ch: { tv: [], epg: [], teams: null, best: ch('10', 'ESPN') } }]);
        (el.querySelector('.lv-card') as HTMLButtonElement).click();
        fixture.detectChanges();
        const search = Array.from(el.querySelectorAll<HTMLButtonElement>('.lv-opts button')).find((b) => b.textContent?.includes('SEARCH_CHANNELS'));
        search?.click();
        await fixture.whenStable();
        fixture.detectChanges();
        expect(searchChannels).toHaveBeenCalledWith('Real Madrid');
        expect(el.querySelector('.lv-opts button b')?.textContent).toBe('Real Madrid TV');
    });
});
