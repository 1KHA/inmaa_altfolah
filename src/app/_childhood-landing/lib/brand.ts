// The identity's four primary colours, in palette order (النيلي، البرتقالي، العسلي، الأخضر).
// `on` is the text/icon colour that keeps contrast on the filled `bg`:
// honey and green are too light for white, so they carry ink instead.
export const brandTones = [
  { bg: "bg-brand-navy", soft: "bg-brand-navy/10", on: "text-brand-cream" },
  { bg: "bg-brand-orange", soft: "bg-brand-orange/10", on: "text-white" },
  { bg: "bg-brand-honey", soft: "bg-brand-honey/20", on: "text-brand-ink" },
  { bg: "bg-brand-green", soft: "bg-brand-green/20", on: "text-brand-ink" },
] as const;

export const toneAt = (index: number) => brandTones[index % brandTones.length];
