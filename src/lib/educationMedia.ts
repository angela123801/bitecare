/**
 * Maps education articles and first-aid steps to their illustrations.
 *
 * Articles live in the database and admins can add new ones, so visuals are
 * resolved by slug first, then category, then a keyword scan of the title and
 * summary, with a safe default. Every visual carries descriptive alt text so
 * the images stay accessible.
 */

export interface TopicVisual {
  src: string;
  alt: string;
}

const RABIES: TopicVisual = {
  src: '/edu-rabies.webp',
  alt: 'A veterinarian giving a rabies vaccination to a calm dog',
};

const BITE_PREVENTION: TopicVisual = {
  src: '/edu-animal-bite-prevention.webp',
  alt: 'A person standing still with open hands as a dog approaches, and someone walking a leashed dog',
};

const WOUND_CARE: TopicVisual = {
  src: '/edu-wound-care.webp',
  alt: 'Two hands being washed under a running tap with soap',
};

const VACCINATION: TopicVisual = {
  src: '/edu-vaccination.webp',
  alt: 'A calendar with completed check marks beside a syringe and a protective shield',
};

const PET_OWNERSHIP: TopicVisual = {
  src: '/edu-pet-ownership.webp',
  alt: 'A person walking a happy dog on a leash beside pet supplies',
};

const SEEK_MEDICAL: TopicVisual = {
  src: '/edu-seek-medical.webp',
  alt: 'A person speaking with a nurse at a clinic reception desk',
};

const CHILDREN_SAFETY: TopicVisual = {
  src: '/edu-children-safety.webp',
  alt: 'A child gently petting a calm dog while a parent supervises',
};

const SLUG_VISUALS: Record<string, TopicVisual> = {
  'understanding-rabies': RABIES,
  'responsible-pet-ownership': PET_OWNERSHIP,
  'protecting-children': CHILDREN_SAFETY,
  'importance-of-vaccination': VACCINATION,
};

const CATEGORY_VISUALS: Record<string, TopicVisual> = {
  rabies: RABIES,
  pet_care: PET_OWNERSHIP,
  children_safety: CHILDREN_SAFETY,
  prevention: VACCINATION,
  vaccination: VACCINATION,
  wound_care: WOUND_CARE,
  treatment: SEEK_MEDICAL,
  medical_care: SEEK_MEDICAL,
};

/** Ordered so the most specific topic wins when several keywords appear. */
const KEYWORD_VISUALS: { match: RegExp; visual: TopicVisual }[] = [
  { match: /rabies/i, visual: RABIES },
  { match: /vaccin|immuni|post.?exposure|pep\b/i, visual: VACCINATION },
  { match: /child|kid|school/i, visual: CHILDREN_SAFETY },
  { match: /pet|owner|dog care|stray|neut|spay/i, visual: PET_OWNERSHIP },
  { match: /wound|wash|clean|scratch|first aid/i, visual: WOUND_CARE },
  { match: /medical|hospital|clinic|doctor|nurse|emergency/i, visual: SEEK_MEDICAL },
  { match: /prevent|avoid|bite|safety/i, visual: BITE_PREVENTION },
];

const DEFAULT_VISUAL = BITE_PREVENTION;

interface EducationVisualInput {
  slug?: string;
  category?: string;
  title?: string;
  summary?: string;
}

/** Resolves the illustration that best fits an education article. */
export function educationVisual(article: EducationVisualInput): TopicVisual {
  if (article.slug && SLUG_VISUALS[article.slug]) return SLUG_VISUALS[article.slug];
  if (article.category && CATEGORY_VISUALS[article.category]) return CATEGORY_VISUALS[article.category];

  const haystack = `${article.title ?? ''} ${article.summary ?? ''} ${article.category ?? ''}`;
  for (const { match, visual } of KEYWORD_VISUALS) {
    if (match.test(haystack)) return visual;
  }
  return DEFAULT_VISUAL;
}

const STEP_SAFETY: TopicVisual = {
  src: '/step-put-safety-first.webp',
  alt: 'A person staying calm with open hands and keeping a safe distance from a dog',
};
const STEP_WASH: TopicVisual = {
  src: '/step-wash-wound.webp',
  alt: 'Hands being washed under running water with soap',
};
const STEP_BLEEDING: TopicVisual = {
  src: '/step-control-bleeding.webp',
  alt: 'Hands pressing a clean cloth firmly onto a wound',
};
const STEP_ANTISEPTIC: TopicVisual = {
  src: '/step-apply-antiseptic.webp',
  alt: 'Antiseptic being applied to a small wound with a cotton pad',
};
const STEP_COVER: TopicVisual = {
  src: '/step-cover-wound.webp',
  alt: 'A clean bandage being applied to a wound',
};
const STEP_CENTER: TopicVisual = {
  src: '/step-go-to-center.webp',
  alt: 'A person arriving at an animal bite treatment centre',
};
const STEP_MONITOR: TopicVisual = {
  src: '/step-monitor.webp',
  alt: 'A magnifying glass inspecting a bandaged wound',
};
const STEP_REPORT: TopicVisual = {
  src: '/step-report.webp',
  alt: 'A smartphone showing a completed bite report',
};
const STEP_AVOID_REMEDIES: TopicVisual = {
  src: '/step-avoid-remedies.webp',
  alt: 'A traditional home remedy crossed out with a prohibition symbol',
};

const STEP_VISUALS: { match: RegExp; visual: TopicVisual }[] = [
  { match: /traditional|herbal|remedies|home remedy/i, visual: STEP_AVOID_REMEDIES },
  { match: /control bleeding|bleeding|pressure/i, visual: STEP_BLEEDING },
  { match: /wash|rinse/i, visual: STEP_WASH },
  { match: /antiseptic|iodine|alcohol|disinfect/i, visual: STEP_ANTISEPTIC },
  { match: /cover|bandage|dressing|gauze|suture/i, visual: STEP_COVER },
  { match: /go to|center|centre|hospital|emergency|clinic/i, visual: STEP_CENTER },
  { match: /monitor|watch|check/i, visual: STEP_MONITOR },
  { match: /report|record|document|submit/i, visual: STEP_REPORT },
  { match: /assess|safety first|stay calm|situation|safety/i, visual: STEP_SAFETY },
];

const DEFAULT_STEP_VISUAL = STEP_SAFETY;

/** Resolves the illustration for a single first-aid step from its wording. */
export function firstAidStepVisual(step: { title: string; description?: string }): TopicVisual {
  const haystack = `${step.title} ${step.description ?? ''}`;
  for (const { match, visual } of STEP_VISUALS) {
    if (match.test(haystack)) return visual;
  }
  return DEFAULT_STEP_VISUAL;
}

/** True for steps that tell the reader what NOT to do. */
export function isAvoidStep(title: string): boolean {
  return /do not|don't|avoid|never|no traditional|no herbal/i.test(title);
}
