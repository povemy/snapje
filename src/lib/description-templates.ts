/**
 * ISSUE 5 (fix-logout-theme-nearme): Auto-Generate Description templates.
 *
 * Each template is a plain string with bracketed placeholders that get
 * replaced at generation time:
 *   [Vendor Name] — the vendor's business name
 *   [Category]    — the vendor's primary food category
 *   [City]        — the city parsed from the vendor's address
 *   [State]       — the state parsed from the vendor's address
 *
 * If a placeholder can't be filled in (e.g. the vendor hasn't entered an
 * address yet), the bracketed token is left as-is so the user knows to
 * edit it manually before saving.
 *
 * Templates are intentionally vendor-agnostic and human-readable so the
 * generated copy can drop straight into the vendor's public listing.
 */

export interface DescriptionTemplate {
  /** Stable id so admins can reference a template across edits. */
  id: string
  /** The template body. Use the bracketed placeholders above. */
  body: string
}

export const DEFAULT_DESCRIPTION_TEMPLATES: DescriptionTemplate[] = [
  {
    id: 'tasty-classic',
    body: 'At [Vendor Name], we serve up the best [Category] in [City], [State]. Every dish is made fresh to order using quality ingredients, so you get bold, authentic flavours in every bite. Drop by today and taste the difference for yourself!',
  },
  {
    id: 'local-favourite',
    body: 'A local favourite in [City], [Vendor Name] is famous for mouth-watering [Category] that keeps customers coming back. Whether you\'re grabbing a quick bite or feeding the family, our generous portions and friendly service never disappoint.',
  },
  {
    id: 'fresh-daily',
    body: 'Craving [Category] in [City], [State]? [Vendor Name] prepares every meal fresh daily using only the finest ingredients. From the first bite to the last, you\'ll taste the care and passion that goes into every plate.',
  },
  {
    id: 'hidden-gem',
    body: 'Tucked away in [City], [Vendor Name] is a hidden gem for authentic [Category]. Our loyal regulars swear by our signature recipes and warm hospitality. Come discover why we\'re one of [State]\'s best-kept food secrets.',
  },
  {
    id: 'family-recipe',
    body: '[Vendor Name] brings you time-honoured [Category] recipes passed down through generations. Located in the heart of [City], [State], we serve the kind of comforting, home-style meals that feel like a hug on a plate.',
  },
  {
    id: 'quick-bite',
    body: 'Need a quick, delicious meal in [City]? [Vendor Name] has you covered with fast, fresh [Category] made to order. Perfect for lunch breaks, busy weeknights, or whenever hunger strikes in [State].',
  },
  {
    id: 'flavour-journey',
    body: 'Embark on a flavour journey at [Vendor Name], where every dish tells a story. Our [Category] menu blends tradition and creativity, bringing the best tastes of [State] straight to your table in [City].',
  },
  {
    id: 'quality-first',
    body: 'Quality you can taste — that\'s the [Vendor Name] promise. We hand-pick our ingredients every morning to craft the finest [Category] in [City], [State]. No shortcuts, no compromises, just great food.',
  },
  {
    id: 'community-staple',
    body: 'More than just a meal, [Vendor Name] is a community staple in [City], [State]. Our [Category] brings neighbours and friends together over food made with love. Join us and become part of the family.',
  },
  {
    id: 'authentic-taste',
    body: 'Experience the authentic taste of [Category] at [Vendor Name] in [City]. Our chefs stay true to traditional recipes, delivering the kind of bold, honest flavours that [State] locals have loved for years.',
  },
  {
    id: 'fresh-ingredients',
    body: 'At [Vendor Name] in [City], [State], we believe great [Category] starts with great ingredients. That\'s why we source locally whenever possible and prep everything in-house daily. Taste the freshness in every bite.',
  },
  {
    id: 'value-deal',
    body: 'Looking for the best [Category] value in [City]? [Vendor Name] serves generous portions at honest prices, without skimping on flavour or quality. Drop by [State]\'s top spot for a meal that won\'t break the bank.',
  },
  {
    id: 'modern-twist',
    body: '[Vendor Name] puts a modern twist on classic [Category], right in the heart of [City], [State]. Whether you\'re a traditionalist or an adventurous eater, our menu has something to surprise and delight you.',
  },
  {
    id: 'warm-welcome',
    body: 'Step into [Vendor Name] and feel right at home. Our [City] kitchen serves up hearty, satisfying [Category] with a side of warm hospitality. Come hungry, leave happy — that\'s the [State] way.',
  },
]

/**
 * Pick a deterministic-but-uniform random template from the list. Pass an
 * optional `exceptId` to avoid repeating the previously-used template
 * (so the "RE-generate" button always produces different copy).
 */
export function pickRandomTemplate(exceptId?: string): DescriptionTemplate {
  const pool = DEFAULT_DESCRIPTION_TEMPLATES.filter(t => t.id !== exceptId)
  const list = pool.length > 0 ? pool : DEFAULT_DESCRIPTION_TEMPLATES
  const idx = Math.floor(Math.random() * list.length)
  return list[idx]
}

/**
 * Try to parse a City and State out of a free-form address string. Malaysian
 * addresses typically end with "Postcode City, State" (e.g. "Jalan Bukit
 * Bintang, 55100 Kuala Lumpur, Wilayah Persekutuan"). We do a best-effort
 * parse — if anything is ambiguous we leave the placeholder as-is so the
 * user can fill it in manually.
 *
 * Returns an object with possibly-empty `city` and `state` strings.
 */
export function parseAddressParts(address: string): { city: string; state: string } {
  if (!address || typeof address !== 'string') return { city: '', state: '' }

  // Split on commas, trim each piece, drop empties.
  const parts = address
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  if (parts.length === 0) return { city: '', state: '' }

  // Heuristic: the LAST part is usually the state (or country). The
  // second-to-last is usually "Postcode City" — extract the alphabetic tail.
  let state = ''
  let city = ''

  // Known Malaysian states/territories — used to confirm a state match.
  const knownStates = [
    'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang',
    'Penang', 'Perak', 'Perlis', 'Sabah', 'Sarawak', 'Selangor',
    'Terengganu', 'Wilayah Persekutuan', 'Kuala Lumpur', 'Putrajaya', 'Labuan',
  ]

  // Find the first part (scanning from the end) that matches a known state.
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]
    if (knownStates.some(s => p.toLowerCase().includes(s.toLowerCase()))) {
      state = p
      // The part before the state is usually "Postcode City" or just "City".
      if (i - 1 >= 0) {
        const cityPart = parts[i - 1]
        // Strip leading postcode (5 digits) if present.
        city = cityPart.replace(/^\d{5}\s*/, '').trim()
      }
      break
    }
  }

  // Fallback: if we couldn't identify a state, use the last part as state
  // and the second-to-last as city (after stripping the postcode).
  if (!state) {
    state = parts[parts.length - 1] || ''
    if (parts.length >= 2) {
      city = parts[parts.length - 2].replace(/^\d{5}\s*/, '').trim()
    }
  }

  return { city, state }
}

/**
 * Replace the bracketed placeholders in a template body with the supplied
 * values. Empty/undefined values leave the placeholder intact so the user
 * can see what still needs to be filled in.
 */
export function fillTemplate(
  template: DescriptionTemplate,
  vars: { vendorName?: string; category?: string; city?: string; state?: string }
): string {
  let out = template.body
  const replace = (token: string, value: string | undefined) => {
    if (value && value.trim()) {
      out = out.split(token).join(value.trim())
    }
  }
  replace('[Vendor Name]', vars.vendorName)
  replace('[Category]', vars.category)
  replace('[City]', vars.city)
  replace('[State]', vars.state)
  return out
}
