import type { AnimalType } from '@/types';

/**
 * Post-submission first-aid guidance, shown in a modal after a bite report is
 * successfully saved. Content is evidence-based and deliberately general:
 * it never prescribes medication or determines a vaccination schedule, which
 * is a decision for the clinician at the Animal Bite Treatment Center.
 */

export interface FirstAidStep {
  title: string;
  description: string;
  /** Set for steps that tell the reader what NOT to do. */
  avoid?: boolean;
}

export interface AnimalFirstAidGuide {
  key: Exclude<AnimalType, never> | 'other';
  /** Heading shown in the modal, e.g. "Dog Bite — First Aid". */
  title: string;
  /** One-line animal-specific context under the heading. */
  intro: string;
  illustration: { src: string; alt: string };
  steps: FirstAidStep[];
  warnings: string[];
  /** Animal-specific note; the general advice always follows. */
  note: string;
}

const WASH: FirstAidStep = {
  title: 'Wash the wound right away',
  description:
    'Wash and flush the wound immediately with plenty of soap and clean running water for about 15 minutes.',
};
const ANTISEPTIC: FirstAidStep = {
  title: 'Apply an antiseptic',
  description:
    'After washing, apply an antiseptic such as povidone-iodine or 70% alcohol to the wound if you have one.',
};
const COVER: FirstAidStep = {
  title: 'Cover the wound',
  description:
    'Cover it with a clean cloth or sterile dressing. Do not stitch or close bite wounds yourself.',
};
const GO_CENTER: FirstAidStep = {
  title: 'Go to an Animal Bite Treatment Center',
  description:
    'Go to the nearest Animal Bite Treatment Center (ABTC) for medical evaluation the same day, even if the wound looks minor. Rabies is fatal once symptoms start, and the vaccine works best before any sign of illness.',
};

/** Steps shared by every animal type — the core evidence-based sequence. */
const COMMON_STEPS: FirstAidStep[] = [WASH, ANTISEPTIC, COVER, GO_CENTER];

const EMERGENCY: FirstAidStep = {
  title: 'Call for emergency help',
  description:
    'For heavy bleeding, a deep wound, a bite to the head, face, neck, or genitals, or any serious injury, go to the emergency room or call 911 immediately.',
};

const DO_NOT_WAIT: FirstAidStep = {
  title: 'Do not wait for symptoms',
  description:
    'Do not wait to see whether you feel sick, and do not treat a possibly rabid animal bite at home. Seek medical assessment today.',
  avoid: true,
};

const NO_REMEDIES: FirstAidStep = {
  title: 'Do not use home remedies',
  description:
    'Do not apply garlic, herbs, oils, chili, or other traditional remedies to the wound. They do not prevent rabies or infection and can make the wound harder to clean.',
  avoid: true,
};

export const ANIMAL_FIRST_AID: Record<'dog' | 'cat' | 'rat' | 'other', AnimalFirstAidGuide> = {
  dog: {
    key: 'dog',
    title: 'Dog Bite — First Aid',
    intro:
      'Dogs are the most common source of rabies exposure to people. Every dog bite that breaks the skin needs medical evaluation.',
    illustration: { src: '/animal-dog.webp', alt: 'Illustration of a dog' },
    steps: [...COMMON_STEPS, EMERGENCY, DO_NOT_WAIT, NO_REMEDIES],
    warnings: [
      'Rabies from a dog bite is fatal once symptoms appear — treatment before symptoms is what saves lives.',
      'Watch the dog from a distance if it is owned and safely confined. Do not try to catch or handle it yourself.',
      'If the dog is owned, ask for its vaccination record and report the bite so it can be monitored.',
    ],
    note: 'A health worker will assess whether you need rabies post-exposure prophylaxis and a tetanus vaccine.',
  },
  cat: {
    key: 'cat',
    title: 'Cat Bite or Scratch — First Aid',
    intro:
      'Cat bites and scratches puncture the skin easily and carry a high risk of bacterial infection, on top of the rabies risk.',
    illustration: { src: '/animal-cat.webp', alt: 'Illustration of a cat' },
    steps: [...COMMON_STEPS, EMERGENCY, DO_NOT_WAIT, NO_REMEDIES],
    warnings: [
      'Cat bite wounds are deep and narrow, so they are prone to serious infection even when they look small.',
      'Do not ignore scratches that break the skin — they are treated with the same urgency as bites.',
      'If the cat is owned, ask for its vaccination record and report the bite so it can be monitored.',
    ],
    note: 'A health worker will assess whether you need rabies post-exposure prophylaxis, a tetanus vaccine, or antibiotics for infection.',
  },
  rat: {
    key: 'rat',
    title: 'Rat Bite — First Aid',
    intro:
      'Rat bites can transmit bacterial infections such as leptospirosis and rat-bite fever, as well as carrying rabies risk in some settings.',
    illustration: { src: '/animal-rat.webp', alt: 'Illustration of a rat' },
    steps: [...COMMON_STEPS, EMERGENCY, DO_NOT_WAIT, NO_REMEDIES],
    warnings: [
      'Rat bites frequently become infected — have the wound assessed even if it looks minor.',
      'If rat urine or floodwater may have contacted the wound or your skin, tell the health worker: leptospirosis is a real risk in the Philippines.',
      'Wash any surface or item the rat also touched.',
    ],
    note: 'A health worker will assess rabies post-exposure prophylaxis, tetanus prevention, and any additional treatment for rat-borne infections.',
  },
  other: {
    key: 'other',
    title: 'Animal Bite — First Aid',
    intro:
      'First aid is the same for any mammal bite. The medical risks vary by species, so professional assessment is especially important.',
    illustration: {
      src: '/animal-other.webp',
      alt: 'Illustration of an animal paw print above a question mark',
    },
    steps: [...COMMON_STEPS, EMERGENCY, DO_NOT_WAIT, NO_REMEDIES],
    warnings: [
      'Bites from bats, monkeys, and wild animals carry a high rabies risk — treat any contact with a bat as an emergency, even without a visible wound.',
      'Tell the health worker exactly which animal bit you; the species changes the medical assessment.',
      'Do not try to capture, kill, or handle the animal yourself.',
    ],
    note: 'A health worker will assess rabies post-exposure prophylaxis and tetanus prevention based on the animal and the wound.',
  },
};
