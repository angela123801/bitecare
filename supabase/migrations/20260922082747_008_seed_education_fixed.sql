/*
# Make education_content author_id nullable and seed content

1. Changes
   - Alter education_content.author_id to be nullable (for system-seeded content)
   - Seed education articles and first aid guides
*/

ALTER TABLE education_content ALTER COLUMN author_id DROP NOT NULL;
ALTER TABLE education_content ALTER COLUMN author_id DROP DEFAULT;

-- Education content seed
INSERT INTO education_content (title, slug, category, content, summary, is_published, sort_order)
VALUES
(
  'Understanding Rabies: What You Need to Know',
  'understanding-rabies',
  'rabies',
  E'## What is Rabies?\n\nRabies is a deadly viral disease that affects the central nervous system of mammals, including humans. It is most commonly transmitted through the bite of an infected animal.\n\n## How is Rabies Transmitted?\n\n- **Animal bites** - The most common route\n- **Scratches** - If saliva enters the wound\n- **Contact with mucous membranes** - Eyes, nose, or mouth exposure\n\n## Signs and Symptoms\n\n1. Fever and headache\n2. Anxiety and confusion\n3. Difficulty swallowing\n4. Excessive salivation\n5. Fear of water (hydrophobia)\n\n## Prevention\n\n- Vaccinate your pets regularly\n- Avoid contact with stray animals\n- Seek immediate medical attention after any bite\n- Complete the full vaccination course\n\nRabies is almost always fatal once symptoms appear, but is **100% preventable** through timely post-exposure treatment.',
  'Learn about rabies, how it spreads, its symptoms, and how to prevent it.',
  true, 1
),
(
  'Responsible Pet Ownership',
  'responsible-pet-ownership',
  'pet_care',
  E'## Key Responsibilities\n\n### 1. Regular Vaccination\nKeep your pet''s rabies vaccination up to date and maintain records.\n\n### 2. Proper Confinement\nKeep pets within your property. Use leashes in public areas.\n\n### 3. Registration\nRegister your pet with the local government.\n\n### 4. Spaying/Neutering\nHelps control stray population and reduces aggression.\n\n### 5. Proper Care\nProvide adequate food, water, shelter, and regular vet visits.',
  'Learn how to be a responsible pet owner and help keep your community safe.',
  true, 2
),
(
  'Protecting Children from Animal Bites',
  'protecting-children',
  'children_safety',
  E'## Why Children Are at Higher Risk\n\nChildren may not recognize warning signs from animals and their smaller size means bites can be more severe.\n\n## Teaching Children\n\n### Do''s\n1. Always ask permission before petting an animal\n2. Let the animal sniff your hand first\n3. Be gentle and calm\n4. Tell an adult immediately if bitten\n\n### Don''ts\n1. Never approach stray animals\n2. Never disturb eating/sleeping animals\n3. Never pull tails or ears\n4. Never run from a dog\n\nSupervision is the best prevention.',
  'Essential guidelines for keeping children safe from animal bites.',
  true, 3
),
(
  'The Importance of Complete Vaccination',
  'importance-of-vaccination',
  'prevention',
  E'## The Essen Regimen\n\nThe standard post-exposure vaccination schedule:\n\n- **Day 0** - Initial immune response\n- **Day 3** - Boosts initial response\n- **Day 7** - Strengthens immunity\n- **Day 14** - Reinforces protection\n- **Day 28** - Ensures long-term immunity\n\nEach dose builds immunity. Incomplete vaccination may leave you vulnerable. Rabies is fatal once symptoms appear.\n\n## Tips\n\n- Set reminders for each appointment\n- Use BiteCare to track your schedule\n- Contact your provider if you miss a dose\n- Never skip doses even if you feel fine',
  'Why completing your full vaccination course is critical after an animal bite.',
  true, 4
)
ON CONFLICT (slug) DO NOTHING;

-- First aid guides seed
INSERT INTO first_aid_guides (title, animal_type, wound_category, steps, warnings, when_to_seek_help, is_published, sort_order)
VALUES
(
  'Category I - Minor Contact',
  'dog', 'I',
  '[{"title":"Assess the Situation","description":"Determine if there was actual contact. Category I involves touching or feeding the animal, or licks on intact skin."},{"title":"Wash the Area","description":"Wash the contact area with soap and water for at least 15 minutes."},{"title":"Monitor","description":"Check for any redness, swelling, or breaks in the skin."},{"title":"Document","description":"Note details and report through BiteCare."}]',
  '["Take minor contact seriously if the animal appeared sick","If you discover any skin break, treat as Category II or III"]',
  'Seek medical attention if the animal was acting strangely or you notice any skin break.',
  true, 1
),
(
  'Category II - Minor Wounds',
  'dog', 'II',
  '[{"title":"Stay Calm","description":"Quick and proper first aid significantly reduces infection risk."},{"title":"Wash the Wound","description":"Wash thoroughly with soap and running water for at least 15 minutes. This is the most effective step."},{"title":"Apply Antiseptic","description":"Apply povidone-iodine, alcohol, or another antiseptic."},{"title":"Cover the Wound","description":"Apply a clean bandage or sterile gauze."},{"title":"No Traditional Remedies","description":"Do not apply herbal remedies, chili, or garlic."},{"title":"Go to Animal Bite Center","description":"You will need rabies vaccination (post-exposure prophylaxis)."},{"title":"Report","description":"Submit a bite report through BiteCare."}]',
  '["Do NOT suck the wound","Do NOT apply tight bandages","Do NOT delay medical attention","Do NOT wait for symptoms"]',
  'Seek medical attention immediately. Category II requires rabies vaccination.',
  true, 2
),
(
  'Category III - Severe Wounds',
  'dog', 'III',
  '[{"title":"Control Bleeding","description":"Apply firm pressure with a clean cloth for severe bleeding."},{"title":"Wash the Wound","description":"Wash thoroughly with soap and running water for at least 15 minutes."},{"title":"Apply Antiseptic","description":"Apply povidone-iodine or alcohol. Do NOT suture the wound."},{"title":"Cover Loosely","description":"Loosely cover with sterile bandage for transport."},{"title":"GO TO EMERGENCY IMMEDIATELY","description":"Category III requires BOTH vaccine AND Rabies Immunoglobulin (RIG). This is a medical emergency."},{"title":"Report","description":"Report through BiteCare once receiving care."}]',
  '["MEDICAL EMERGENCY - do not delay","Do NOT suture the wound yourself","You need BOTH vaccine AND RIG","Bites on head/neck/hands are especially urgent"]',
  'GO TO THE NEAREST ANIMAL BITE CENTER OR EMERGENCY ROOM IMMEDIATELY.',
  true, 3
)
ON CONFLICT DO NOTHING;
