/**
 * Central project content.
 *
 * Every dimension and area below is copied from the Revision 05 plan sheet
 * (public/docs/revision-05-plans.pdf, 31 Oct 2026), which is the source of
 * truth. Revision 05 redraws Revision 04 on the measured plot width (10.80 m
 * at the street, 10.00 m at the rear wall). Do not add a figure that is not
 * on that sheet. Where a value comes
 * from another document, `source` says which.
 */

export interface Fact {
  readonly label: string;
  readonly value: string;
  /** Short qualifier shown under the label, e.g. "clear" or "gross". */
  readonly detail?: string;
}

export interface FactGroup {
  readonly title: string;
  readonly facts: readonly Fact[];
}

export interface DesignNote {
  readonly title: string;
  readonly body: string;
  /** Set when the note is not stated on the plan sheet itself. */
  readonly source?: string;
}

export interface PlanSheet {
  readonly id: string;
  readonly title: string;
  readonly caption: string;
  /** Full-resolution render, used in the zoom viewer. */
  readonly image: string;
  /** Smaller render for the inline preview. */
  readonly preview: string;
  readonly width: number;
  readonly height: number;
  readonly pdf: string;
}

export interface ProjectDocument {
  readonly title: string;
  readonly description: string;
  readonly href: string;
  /** File type and size as shown to the reader, e.g. "PDF · 75 KB". */
  readonly meta: string;
}

/**
 * A contact channel is rendered only when its value is non-null.
 * Leaving a value null hides the button entirely rather than emitting a
 * dead link.
 */
export interface ContactConfig {
  /** E.164, e.g. '+37477123456'. */
  readonly phone: string | null;
  /** Digits only, no '+', e.g. '37477123456'. */
  readonly whatsapp: string | null;
  /** Username without '@', or a phone number in '+374…' form. */
  readonly telegram: string | null;
  readonly email: string | null;
}

export const PROJECT = {
  name: 'ZOHRAP 130',
  title: 'House over warehouse',
  revision: 'Revision 05',
  revisionDate: '31 Oct 2026',
  address: 'G. Zohrap St. 130, Ajapnyak, Yerevan',

  summary:
    'A new building replacing the old one on the plot: an L-shaped rental warehouse and a ' +
    'private garage on the ground floor, the house with an enclosed lobby and terraces above. ' +
    'Concept only; dimensions in metres.',

  factGroups: [
    {
      title: 'Overall',
      facts: [
        {
          label: 'Footprint',
          value: '10.80 / 10.00 × 17.00 m',
          detail: 'street / rear width; right side angles in',
        },
        { label: 'Gross footprint', value: '176.8 m²' },
        { label: 'Windows', value: 'Front and rear only', detail: 'side walls are blind' },
      ],
    },
    {
      title: 'Ground floor',
      facts: [
        {
          label: 'Rental warehouse',
          value: '≈ 100 m²',
          detail: 'clear, L-shaped; front wing 4.15 m wide',
        },
        { label: 'WC', value: '2.00 × 2.00 m' },
        { label: 'Private garage', value: '5.55–5.90 × 6.80 m', detail: 'clear, front right' },
        {
          label: 'U-stair',
          value: '5.45–5.55 × 2.60 m',
          detail: 'behind the garage, ≈ 1.10 m flight',
        },
      ],
    },
    {
      title: 'Upper floor',
      facts: [
        { label: 'House block', value: '109.7 m²', detail: 'gross' },
        {
          label: 'Enclosed stair / lobby',
          value: '26.5 m²',
          detail: '≈ 6.15 × 4.30 m gross, above garage',
        },
        { label: 'Enclosed total', value: '136.2 m²' },
        {
          label: 'Open terrace',
          value: '40.6 m²',
          detail: 'gross; front 10.80 × 2.00 m + side 4.45 × 4.30 m',
        },
        { label: 'Upper floor total', value: '176.8 m²', detail: '136.2 + 40.6, gross' },
      ],
    },
    {
      title: 'Rooms',
      facts: [
        { label: 'Bedrooms (2)', value: '≈ 14.4 m² each', detail: '3.90 × 3.70 m clear' },
        { label: 'Living', value: '4.00 m', detail: 'clear width' },
        { label: 'Bath', value: '3.70 × 1.50 m' },
        { label: 'Laundry', value: '≈ 1.65 × 1.50 m' },
        { label: 'Hall', value: '1.20 m', detail: 'clear' },
        { label: 'Passage to garden', value: '1.30–1.50 m', detail: 'clear' },
      ],
    },
  ] as readonly FactGroup[],

  /** Plan sheet notes: gross areas include walls; terrace before railings/curbs. */
  areaNote: 'Gross areas include walls. Terrace area is before railings and curbs.',

  designNotes: [
    {
      title: 'Blind side walls',
      body:
        'Both side walls are party walls with the neighbours and have no windows. Windows sit on ' +
        'the street and garden sides only.',
    },
    {
      title: 'Skylights',
      body:
        'Kitchen, bath and hall get daylight from roof skylights, since side windows are not ' +
        'possible.',
      source: 'Illustrated floor plans and 3D model',
    },
    {
      title: 'Home route through the garage only',
      body:
        'Garage → enclosed stair → roofed lobby → living room. There is no access to the house ' +
        'through the rental area. The living room has a separate door to the open terrace.',
    },
    {
      title: 'Provisional garden stair',
      body:
        'The rear garden exit is reserved only. It is not usable until levels, an external ' +
        'landing or stair, and boundary clearances are verified.',
    },
  ] as readonly DesignNote[],

  /** Rev 05 "Design basis / read before using this sketch", verbatim in substance. */
  toVerify: [
    'The new enclosure is conceptual: verify roof, structural support, headroom, ventilation and fire separation from the garage and rental storage.',
    'Stair: final rise and headroom need coordinated design.',
    'Width update: the plot was measured on 31 Oct 2026 at 10.80 m on the street side and 10.00 m where the building ends. Revision 04 assumed 9.00 m.',
    'Width check at the rear: 0.30 + 3.90 + 0.15 + 3.90 + 0.15 + 1.30 + 0.30 = 10.00 m. At the street: 0.30 + 4.15 + 0.15 + 5.90 + 0.30 = 10.80 m.',
    'The extra width is shared out as a proposal (wider living, bedrooms, garage, lobby); room splits are for the architect to confirm.',
    'Tape measurement only: which boundary angles, boundary clearances and planning approval must be confirmed against the cadastral survey.',
  ] as readonly string[],

  planSheets: [
    {
      id: 'revision-05',
      title: 'Revision 05 plan sheet',
      caption: 'Source of truth for every dimension and area. Front at bottom, garden at top.',
      image: '/images/plans/revision-05.webp',
      preview: '/images/plans/revision-05-1200.webp',
      width: 2400,
      height: 1920,
      pdf: '/docs/revision-05-plans.pdf',
    },
    {
      id: 'illustrated',
      title: 'Illustrated floor plans',
      caption:
        'Top-down render of the Revision 05 model on the real plot width, with an area schedule. Furniture and finishes are illustrative.',
      image: '/images/plans/floor-plans-illustrated.webp',
      preview: '/images/plans/floor-plans-illustrated-1200.webp',
      width: 3000,
      height: 2063,
      pdf: '/docs/floor-plans-illustrated.pdf',
    },
  ] as readonly PlanSheet[],

  documents: [
    {
      title: 'Revision 05 plan sheet',
      description:
        'Ground and upper floor on the measured plot width, area check and design basis. 31 Oct 2026.',
      href: '/docs/revision-05-plans.pdf',
      meta: 'PDF · 175 KB',
    },
    {
      title: 'Illustrated floor plans',
      description: 'Furnished plan render with area schedule and design notes.',
      href: '/docs/floor-plans-illustrated.pdf',
      meta: 'PDF · 2.6 MB',
    },
    {
      title: '3D concept model',
      description: 'The model above as a single standalone page. Needs an internet connection.',
      href: '/docs/house-over-warehouse-3d.html',
      meta: 'HTML · 51 KB',
    },
    {
      title: 'Ownership certificate',
      description:
        'State registration of rights, 30 Aug 2022, cadastral code 01-001-0306-0048. In Armenian.',
      href: '/docs/ownership-certificate.pdf',
      meta: 'PDF · 0.8 MB',
    },
    {
      title: 'Site map',
      description: 'The plot highlighted in green among the neighbouring buildings.',
      href: '/images/site-map.png',
      meta: 'PNG · 64 KB',
    },
  ] as readonly ProjectDocument[],

  contact: {
    phone: '+37498512371',
    whatsapp: '37498512371',
    telegram: '+37498512371',
    email: 'barsegyan96armen@gmail.com',
  } as ContactConfig,

  whatsappMessage:
    'Hello, I am reviewing the House over warehouse concept (Revision 05) for G. Zohrap 130.',

  emailSubject: 'House over warehouse, Revision 05',

  year: 2026,
} as const;

/** True when at least one contact channel is configured. */
export const HAS_CONTACT =
  PROJECT.contact.phone !== null ||
  PROJECT.contact.whatsapp !== null ||
  PROJECT.contact.telegram !== null ||
  PROJECT.contact.email !== null;
