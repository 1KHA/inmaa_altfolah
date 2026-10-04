interface SectionHeadingProps {
  title: string;
  subtitle?: string;
}

export function SectionHeading({ title, subtitle }: SectionHeadingProps) {
  return (
    <div className="text-center mb-16 space-y-6">
      <h2 className="brand-pill text-3xl lg:text-4xl leading-normal arabic-text">{title}</h2>
      {subtitle && (
        <p className="text-xl text-muted-foreground arabic-text max-w-3xl mx-auto">
          {subtitle}
        </p>
      )}
    </div>
  );
}
