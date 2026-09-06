/**
 * Symbolic Couple Agreement Promises & Text Data
 * Sincere, warm bonding statements focused on honesty, kindness, and mutual support.
 */

export interface AgreementPromise {
  id: string;
  title: string;
  statement: string;
  icon: string;
}

export const AGREEMENT_PROMISES: AgreementPromise[] = [
  {
    id: "honesty",
    title: "Honesty & Open Communication",
    statement: "We promise to speak truthfully, share our feelings openly, and listen to each other with empathy without judgment.",
    icon: "MessageCircle",
  },
  {
    id: "kindness",
    title: "Kindness & Daily Appreciation",
    statement: "We promise to treat each other with gentle kindness, celebrate small moments, and express gratitude every single day.",
    icon: "Heart",
  },
  {
    id: "support",
    title: "Unconditional Support & Growth",
    statement: "We promise to encourage each other's dreams, stand side-by-side through life's challenges, and celebrate each other's growth.",
    icon: "Sparkles",
  },
  {
    id: "patience",
    title: "Patience & Empathy in Conflicts",
    statement: "We promise to approach disagreements with patience, prioritize understanding over being right, and always choose love first.",
    icon: "Shield",
  },
  {
    id: "joy",
    title: "Cherishing Our Shared Joy",
    statement: "We promise to nurture playfulness, hold hands through new adventures, and keep our bond strong, joyful, and sacred.",
    icon: "Sun",
  },
];

export const FULL_AGREEMENT_TEXT = `Symbolic Couple Bonding Agreement

We, two souls united in love and companionship, hereby make these heart-to-heart promises to one another:

1. Honesty & Open Communication: To share our thoughts openly, speak truth with gentleness, and listen with empathy.
2. Kindness & Daily Appreciation: To cherish each day together, offer kindness freely, and celebrate our shared joy.
3. Unconditional Support & Growth: To support each other's passions and dreams, remaining faithful allies through every season.
4. Patience & Forgiveness: To resolve differences with patience, seek harmony over pride, and protect our sacred bond.
5. Lifetime Companionate Joy: To laugh together, nurture our connection, and treasure the journey we share hand in hand.

"This is a symbolic promise between you two — not a legally binding document."`;
