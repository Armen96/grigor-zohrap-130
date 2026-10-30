import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PROJECT } from '../../project.config';
import { RevealDirective } from '../../shared/reveal.directive';

@Component({
  selector: 'app-documents',
  templateUrl: './documents.html',
  imports: [RevealDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Documents {
  protected readonly documents = PROJECT.documents;
}
