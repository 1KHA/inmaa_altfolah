/**
 * Answers to "ماهو مجالك المهني؟": the four areas a participant contributes to
 * a team, each with examples. The registration forms offer them as a dropdown
 * (examples shown under each option) and the admin import checks against them.
 */
export const PROFESSIONAL_FIELD_OPTIONS = [
  { value: 'الطفولة والمجالات المهنية', examples: 'التعليم، علم النفس، الخدمة الاجتماعية، الصحة، حماية الطفل' },
  { value: 'التقنية', examples: 'البرمجة، البيانات، الذكاء الاصطناعي، الأمن، المنتجات الرقمية' },
  { value: 'التصميم', examples: 'تجربة المستخدم، تصميم الخدمات، النمذجة، التصميم البصري' },
  { value: 'التنفيذ والأثر', examples: 'ريادة الأعمال، إدارة المشاريع، الشراكات، الاستدامة، قياس الأثر' },
] as const;

export const PROFESSIONAL_FIELDS: readonly string[] = PROFESSIONAL_FIELD_OPTIONS.map((o) => o.value);

/** Examples for a stored answer, or undefined for free text from before the dropdown. */
export function professionalFieldExamples(value: string): string | undefined {
  return PROFESSIONAL_FIELD_OPTIONS.find((o) => o.value === value)?.examples;
}
