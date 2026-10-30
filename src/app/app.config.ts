import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

/**
 * Single-page site: the router is intentionally not provided, which keeps it
 * out of the bundle. Navigation is plain in-page anchors.
 */
export const appConfig: ApplicationConfig = {
  providers: [provideBrowserGlobalErrorListeners(), provideClientHydration(withEventReplay())],
};
