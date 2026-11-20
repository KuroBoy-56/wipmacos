import { clearParentalPin, isAdultName, readParentalPin, saveParentalPin } from '@iptvnator/shared/interfaces';
import { ParentalControlService } from './parental-control.service';

describe('ParentalControlService (control parental con el PIN del panel)', () => {
    beforeEach(() => localStorage.clear());

    it('oculta las categorías para adultos hasta desbloquear con el PIN del panel', () => {
        const p = new ParentalControlService();
        const cats = [{ id: '1', name: 'Acción' }, { id: '2', name: 'XXX Adultos' }, { id: '3', name: '+18 Hot' }];
        expect(p.visible(cats, (c) => c.name).map((c) => c.id)).toEqual(['1']);
        expect([...p.hiddenIds(cats, (c) => c.name, (c) => c.id)]).toEqual(['2', '3']);
        expect(p.unlock('1234')).toBe(false);
        expect(p.unlock('0000')).toBe(true);
        expect(p.visible(cats, (c) => c.name)).toHaveLength(3);
        p.reset();
        expect(p.locked()).toBe(true);
    });

    it('usa el PIN que guarda el panel y solo PIN de 4 números', () => {
        saveParentalPin('4321');
        saveParentalPin('12');
        expect(readParentalPin()).toBe('4321');
        const p = new ParentalControlService();
        expect(p.unlock('0000')).toBe(false);
        expect(p.unlock('4321')).toBe(true);
    });

    it('apagar «Ocultar contenido para adultos» pide el PIN', () => {
        const p = new ParentalControlService();
        expect(p.setHideAdult(false, '9999')).toBe(false);
        expect(p.hideAdult()).toBe(true);
        expect(p.setHideAdult(false, '0000')).toBe(true);
        expect(p.locked()).toBe(false);
        expect(new ParentalControlService().hideAdult()).toBe(false);
        expect(isAdultName('Playboy TV')).toBe(true);
        expect(isAdultName('Documentales')).toBe(false);
    });

    it('bloquear categorías (como Roku): se ocultan con sus títulos aunque los adultos estén visibles, y el desbloqueo de la sesión las muestra', () => {
        const p = new ParentalControlService();
        const cats = [{ id: '1', name: 'Acción' }, { id: '2', name: 'Infantil' }, { id: '3', name: 'XXX' }];
        p.toggleBlocked('vod:2');
        expect(p.visible(cats, (c) => c.name, (c) => 'vod:' + c.id).map((c) => c.id)).toEqual(['1']);
        expect([...p.hiddenIds(cats, (c) => c.name, (c) => c.id, 'vod')]).toEqual(['2', '3']);
        // la misma id en otro tipo no está bloqueada
        expect(p.visible(cats, (c) => c.name, (c) => 'series:' + c.id).map((c) => c.id)).toEqual(['1', '2']);
        // adultos visibles: la bloqueada sigue oculta
        expect(p.setHideAdult(false, '0000')).toBe(true);
        expect(p.visible(cats, (c) => c.name, (c) => 'vod:' + c.id).map((c) => c.id)).toEqual(['1', '3']);
        // contenido protegido desbloqueado en esta sesión: todo
        expect(p.unlock('0000')).toBe(true);
        expect(p.visible(cats, (c) => c.name, (c) => 'vod:' + c.id)).toHaveLength(3);
        // se guarda en el equipo
        expect(new ParentalControlService().blocked().has('vod:2')).toBe(true);
        p.toggleBlocked('vod:2');
        expect(new ParentalControlService().blocked().has('vod:2')).toBe(false);
        expect(p.checkPin('0000')).toBe(true);
        expect(p.checkPin('1111')).toBe(false);
    });
    it('cada línea con lo suyo: otro usuario empieza de cero y el anterior lo encuentra al volver', () => {
        const line = (user: string) => {
            localStorage.setItem('session_user', user);
            localStorage.setItem('session_server', 'http://srv.test:8080');
        };
        line('ana');
        const p = new ParentalControlService();
        p.toggleBlocked('vod:2');
        expect(p.setHideAdult(false, '0000')).toBe(true);
        // otro usuario en el equipo: «Ocultar…» encendido y nada bloqueado
        line('beto');
        p.reload();
        expect(p.hideAdult()).toBe(true);
        expect(p.blocked().size).toBe(0);
        // vuelve el primero: lo suyo sigue ahí
        line('ana');
        p.reload();
        expect(p.hideAdult()).toBe(false);
        expect(p.blocked().has('vod:2')).toBe(true);
    });

    it('lo guardado antes para todo el equipo pasa a la primera línea que entra, y el PIN se borra al cerrar la sesión', () => {
        localStorage.setItem('parental_blocked_cats', '["live:9"]');
        localStorage.setItem('parental_hide_adult', '0');
        localStorage.setItem('session_user', 'ana');
        localStorage.setItem('session_server', 'http://srv.test');
        const p = new ParentalControlService();
        expect(p.blocked().has('live:9')).toBe(true);
        expect(p.hideAdult()).toBe(false);
        expect(localStorage.getItem('parental_blocked_cats')).toBeNull();
        saveParentalPin('4321');
        clearParentalPin();
        expect(readParentalPin()).toBe('0000');
    });
});
