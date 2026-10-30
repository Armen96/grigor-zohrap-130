import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HAS_CONTACT, PROJECT } from '../../project.config';
import { Analytics } from '../../shared/analytics';
import { RevealDirective } from '../../shared/reveal.directive';

@Component({
  selector: 'app-contact',
  templateUrl: './contact.html',
  imports: [RevealDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Contact {
  private readonly analytics = inject(Analytics);

  protected readonly project = PROJECT;
  protected readonly hasContact = HAS_CONTACT;
  protected readonly contact = PROJECT.contact;

  protected readonly telHref = this.contact.phone ? `tel:${this.contact.phone}` : null;

  /** Shown on the button so the number can be noted down. */
  protected readonly phoneDisplay = this.contact.phone
    ? this.contact.phone.replace(/^(\+374)(\d{2})(\d{3})(\d{3})$/, '$1 $2 $3 $4')
    : null;

  protected readonly whatsappHref = this.contact.whatsapp
    ? `https://wa.me/${this.contact.whatsapp}?text=${encodeURIComponent(PROJECT.whatsappMessage)}`
    : null;

  /** t.me accepts either a username or a '+'-prefixed phone number. */
  protected readonly telegramHref = this.contact.telegram
    ? `https://t.me/${this.contact.telegram.replace(/^@/, '')}`
    : null;

  protected readonly emailHref = this.contact.email
    ? `mailto:${this.contact.email}` +
      `?subject=${encodeURIComponent(PROJECT.emailSubject)}` +
      `&body=${encodeURIComponent(PROJECT.whatsappMessage)}`
    : null;

  /** Target for the single sticky mobile button — calling comes first. */
  protected readonly primaryHref =
    this.telHref ?? this.whatsappHref ?? this.telegramHref ?? this.emailHref;

  protected track(method: 'phone' | 'whatsapp' | 'telegram' | 'email'): void {
    this.analytics.trackContact(method);
  }
}
