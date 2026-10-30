import { DOCUMENT } from '@angular/common';
import { Injectable, inject, isDevMode } from '@angular/core';

/**
 * GA4 measurement id, taken from the Firebase web app config.
 *
 * This is the only value from that config the site needs. The rest of it
 * (apiKey, appId, messagingSenderId, storageBucket) exists to address Firebase
 * SDK products — Auth, Firestore, Storage — and this is a static page that
 * uses none of them, so pulling in the `firebase` package would add tens of
 * kilobytes to serve one analytics call. Loading gtag.js directly reports to
 * the same GA4 property.
 *
 * A measurement id is not a credential: it ships in the page source of every
 * site that uses GA4.
 */
const MEASUREMENT_ID = 'G-CH56B5F88F';

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

@Injectable({ providedIn: 'root' })
export class Analytics {
  private readonly document = inject(DOCUMENT);
  private loaded = false;

  /**
   * Injects gtag.js. Must be called from a browser-only hook — prerendering
   * runs in Node, where there is no document to attach to. Skipped in dev so
   * local work does not pollute the property's statistics.
   */
  load(): void {
    if (this.loaded || isDevMode()) {
      return;
    }

    const window = this.document.defaultView;
    if (!window) {
      return;
    }

    this.loaded = true;

    const script = this.document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    // A blocked or failed tag must never take the page down with it.
    script.onerror = () => {
      this.loaded = false;
    };
    this.document.head.appendChild(script);

    window.dataLayer = window.dataLayer ?? [];
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer!.push(args);
    };
    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID, { anonymize_ip: true });
  }
}
