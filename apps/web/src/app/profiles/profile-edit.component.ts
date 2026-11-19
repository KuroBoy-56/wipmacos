import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Profile, ProfileResult, ProfilesData, ProfilesService } from '@iptvnator/services';

/**
 * Agregar o editar un perfil (docs/PERFILES.md del panel): avatar de la lista del panel, nombre, «Perfil infantil»
 * solo al crear, bloquear / cambiar / quitar el PIN y «Eliminar perfil» (nunca el principal; se recupera 7 días con
 * el mismo nombre exacto). Mismo orden de pasos que la web player: crear y después el PIN.
 */
@Component({
    selector: 'app-profile-edit',
    standalone: true,
    imports: [MatIcon, TranslatePipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    templateUrl: './profile-edit.component.html',
})
export class ProfileEditComponent implements OnInit {
    private readonly profiles = inject(ProfilesService);
    private readonly translate = inject(TranslateService);

    /** null = agregar */
    readonly profile = input<Profile | null>(null);
    readonly data = input.required<ProfilesData>();
    /** PIN ya comprobado del perfil bloqueado ('' si no tiene) */
    readonly pin = input('');
    readonly saved = output<{ id: string; pin: string }>();
    readonly deleted = output<string>();
    readonly closed = output<void>();

    protected readonly name = signal('');
    protected readonly avatar = signal('');
    protected readonly kids = signal(false);
    protected readonly pinOn = signal(false);
    protected readonly pinChange = signal(false);
    protected readonly pinOff = signal(false);
    protected readonly pickAvatar = signal(false);
    protected readonly confirmDelete = signal(false);
    protected readonly busy = signal(false);
    protected readonly error = signal('');
    protected readonly locked = computed(() => !!this.profile()?.locked);
    protected readonly askNewPin = computed(() => (this.locked() ? this.pinChange() : this.pinOn()));

    ngOnInit(): void {
        const p = this.profile();
        const d = this.data();
        this.name.set(p?.name ?? '');
        const used = new Set(d.profiles.map((x) => x.avatar));
        this.avatar.set(p?.avatar ?? d.avatars.find((a) => !used.has(a)) ?? d.avatars[0] ?? '');
    }

    protected backdrop(e: MouseEvent): void {
        if (e.target === e.currentTarget) this.closed.emit();
    }

    protected choose(a: string): void {
        this.avatar.set(a);
        this.pickAvatar.set(false);
    }

    private t(key: string): string {
        return this.translate.instant('MPX.PROFILES.' + key);
    }

    private fail(r: ProfileResult): void {
        if (!r.ok) this.error.set(r.error || this.t('NET'));
    }

    protected async save(pin1: string, pin2: string): Promise<void> {
        if (this.busy()) return;
        const name = this.name().replace(/\s+/g, ' ').trim();
        if (!name) return this.error.set(this.t('NAME_REQUIRED'));
        let newPin = '';
        if (this.askNewPin()) {
            if (!/^\d{4}$/.test(pin1)) return this.error.set(this.t('PIN_DIGITS'));
            if (pin1 !== pin2) return this.error.set(this.t('PIN_MISMATCH'));
            newPin = pin1;
        }
        this.busy.set(true);
        this.error.set('');
        const p = this.profile();
        let cur = this.pin();
        let id = p?.id ?? '';
        let r: ProfileResult;
        if (!p) {
            r = await this.profiles.act('create', { name, avatar: this.avatar(), kids: this.kids() });
            if (r.ok) id = r.data.profiles.find((x) => x.name === name)?.id ?? '';
            if (r.ok && newPin && id) {
                r = await this.profiles.act('pin_set', { id, new_pin: newPin });
                if (r.ok) cur = newPin;
            }
        } else {
            const fields: Record<string, unknown> = { id, pin: cur };
            if (name !== p.name) fields['name'] = name;
            if (this.avatar() !== p.avatar) fields['avatar'] = this.avatar();
            r = 'name' in fields || 'avatar' in fields ? await this.profiles.act('update', fields) : { ok: true, data: this.data() };
            if (r.ok && newPin) {
                r = await this.profiles.act('pin_set', { id, new_pin: newPin, pin: cur });
                if (r.ok) cur = newPin;
            } else if (r.ok && this.pinOff()) {
                r = await this.profiles.act('pin_clear', { id, pin: cur });
                if (r.ok) cur = '';
            }
        }
        this.busy.set(false);
        if (!r.ok) return this.fail(r);
        this.saved.emit({ id, pin: cur });
    }

    protected async remove(): Promise<void> {
        const p = this.profile();
        if (!p || this.busy()) return;
        this.busy.set(true);
        const r = await this.profiles.act('delete', { id: p.id, pin: this.pin() });
        this.busy.set(false);
        if (!r.ok) return this.fail(r);
        this.deleted.emit(p.id);
    }
}
