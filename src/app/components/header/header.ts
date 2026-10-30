import { ChangeDetectionStrategy, Component, HostListener, computed, signal } from '@angular/core';
import { HAS_CONTACT, PROJECT } from '../../project.config';

interface NavLink {
  readonly fragment: string;
  readonly label: string;
}

@Component({
  selector: 'app-header',
  templateUrl: './header.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Header {
  protected readonly project = PROJECT;
  protected readonly hasContact = HAS_CONTACT;

  protected readonly links: readonly NavLink[] = [
    { fragment: 'model', label: '3D model' },
    { fragment: 'facts', label: 'Key facts' },
    { fragment: 'plans', label: 'Floor plans' },
    { fragment: 'notes', label: 'Design notes' },
    { fragment: 'plot', label: 'Plot' },
    { fragment: 'documents', label: 'Documents' },
  ];

  protected readonly menuOpen = signal(false);

  /** Tailwind utilities containing `/` or `[]` are not valid `[class.x]` keys. */
  protected readonly menuPanelClass = computed(() =>
    this.menuOpen() ? 'max-h-[28rem] opacity-100' : 'max-h-0 opacity-0',
  );

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.closeMenu();
  }
}
