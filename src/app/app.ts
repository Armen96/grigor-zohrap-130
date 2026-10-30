import { Component, afterNextRender, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Analytics } from './shared/analytics';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('grigor-zohrap-130');

  constructor() {
    const analytics = inject(Analytics);
    // Browser-only: the prerender pass has no document to attach the tag to.
    afterNextRender(() => analytics.load());
  }
}
