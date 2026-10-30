import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PROJECT } from '../../project.config';
import { RevealDirective } from '../../shared/reveal.directive';

@Component({
  selector: 'app-key-facts',
  templateUrl: './key-facts.html',
  imports: [RevealDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeyFacts {
  protected readonly project = PROJECT;
}
