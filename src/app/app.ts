import { ChangeDetectionStrategy, Component, afterNextRender, inject } from '@angular/core';
import { Contact } from './components/contact/contact';
import { DesignNotes } from './components/design-notes/design-notes';
import { Documents } from './components/documents/documents';
import { FloorPlans } from './components/floor-plans/floor-plans';
import { Footer } from './components/footer/footer';
import { Header } from './components/header/header';
import { KeyFacts } from './components/key-facts/key-facts';
import { ModelViewer } from './components/model-viewer/model-viewer';
import { Plot } from './components/plot/plot';
import { Analytics } from './shared/analytics';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  imports: [
    Header,
    ModelViewer,
    KeyFacts,
    FloorPlans,
    DesignNotes,
    Plot,
    Documents,
    Contact,
    Footer,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  constructor() {
    const analytics = inject(Analytics);
    // Browser-only: the prerender pass has no document to attach the tag to.
    afterNextRender(() => analytics.load());
  }
}
