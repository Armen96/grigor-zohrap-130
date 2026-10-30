import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PROJECT } from '../../project.config';
import { RevealDirective } from '../../shared/reveal.directive';

@Component({
  selector: 'app-design-notes',
  templateUrl: './design-notes.html',
  imports: [RevealDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DesignNotes {
  protected readonly notes = PROJECT.designNotes;
  protected readonly toVerify = PROJECT.toVerify;
  protected readonly revision = PROJECT.revision;
}
