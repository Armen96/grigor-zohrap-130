import { ChangeDetectionStrategy, Component, afterNextRender, inject } from '@angular/core';
import { ModelViewer } from './components/model-viewer/model-viewer';
import { Analytics } from './shared/analytics';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  imports: [ModelViewer],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  constructor() {
    const analytics = inject(Analytics);
    // Browser-only: the prerender pass has no document to attach the tag to.
    afterNextRender(() => analytics.load());
  }
}
