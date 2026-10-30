import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HAS_CONTACT, PROJECT } from '../../project.config';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Footer {
  protected readonly project = PROJECT;

  /**
   * The sticky mobile contact bar is fixed over the bottom of the viewport,
   * so the footer reserves room for it rather than sitting underneath.
   */
  protected readonly footerClass = HAS_CONTACT ? 'pb-32 lg:pb-12' : 'pb-12';
}
