"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PRACTICE_CARD_COUNT,
  PRACTICE_TONES,
  type PracticeAnswers,
  type PracticeCard,
  type PracticeField,
  type PracticeSection,
  type PracticeTone,
} from "@/lib/practice-cards";

/*
 * One practice card drawn like its page in practice/نماذج المختبرات.pdf: the
 * teal top stripe, the purple number box, white boxes with a coloured side
 * bar, tinted panels, the stakeholder matrix and the problem/solution trees.
 * Editable for the team leader, read-only for everyone else.
 */

interface ViewProps {
  answers: PracticeAnswers;
  editable: boolean;
  onChange?: (key: string, value: string) => void;
}

const LABEL = "#1F2937";
const HINT = "#9CA3AF";
const BOX_BORDER = "#D9DEE3";

const accent = (tone: PracticeTone = "purple") => PRACTICE_TONES[tone].accent;
const tint = (tone: PracticeTone = "purple") => PRACTICE_TONES[tone].tint;

// Literal class names so Tailwind keeps them
const ROW_COLS: Record<number, string> = {
  1: "md:grid-cols-1",
  2: "md:grid-cols-2",
  3: "md:grid-cols-3",
  4: "md:grid-cols-2 lg:grid-cols-4",
  5: "md:grid-cols-3 lg:grid-cols-5",
};
const COL_SPAN: Record<number, string> = { 2: "md:col-span-2" };
const COLUMN_COLS: Record<number, string> = {
  4: "md:grid-cols-2 lg:grid-cols-4",
  6: "md:grid-cols-3 lg:grid-cols-6",
};

/** Ruled lines behind multi-line answers, like the sheet's writing lines. */
const RULED = {
  backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent 27px, #E5E7EB 27px, #E5E7EB 28px)",
  lineHeight: "28px",
};

function AutoTextarea({
  value,
  rows,
  ruled,
  onChange,
  className,
  ariaLabel,
}: {
  value: string;
  rows: number;
  ruled?: boolean;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // Grow with the text instead of scrolling inside a small box
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={rows}
      value={value}
      aria-label={ariaLabel}
      placeholder="اكتب هنا…"
      onChange={(e) => onChange(e.target.value)}
      style={ruled ? RULED : undefined}
      className={cn(
        "mt-2 block w-full resize-none overflow-hidden rounded-md bg-transparent px-1 text-sm leading-7 text-gray-800 outline-none transition-colors placeholder:text-gray-300 focus:bg-white/70 focus:ring-2 focus:ring-[#00AFA0]/30",
        className
      )}
    />
  );
}

/** The answer itself: an input when editable, the saved text otherwise. */
function FieldValue({
  field,
  view,
  ruled,
  light,
}: {
  field: PracticeField;
  view: ViewProps;
  ruled?: boolean;
  /** On a filled (dark) background */
  light?: boolean;
}) {
  const value = view.answers[field.key] ?? "";
  const set = (v: string) => view.onChange?.(field.key, v);
  const kind = field.kind ?? "textarea";

  if (kind === "choice") {
    return (
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={field.label}>
        {field.options?.map((option) => {
          const checked = value === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={!view.editable}
              onClick={() => set(checked ? "" : option)}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors",
                checked ? "font-bold text-white" : "bg-white text-gray-700",
                view.editable ? "cursor-pointer hover:border-gray-400" : "cursor-default"
              )}
              style={checked ? { background: accent(field.tone), borderColor: accent(field.tone) } : { borderColor: BOX_BORDER }}
            >
              <span
                aria-hidden
                className="inline-block h-3.5 w-3.5 rounded-sm border"
                style={{ borderColor: checked ? "#fff" : HINT, background: checked ? "#fff" : "transparent" }}
              />
              {option}
            </button>
          );
        })}
      </div>
    );
  }

  if (!view.editable) {
    return value ? (
      <p
        className={cn("mt-2 whitespace-pre-wrap break-words px-1 text-sm leading-7", light ? "text-white" : "text-gray-800")}
        style={ruled ? RULED : undefined}
      >
        {value}
      </p>
    ) : (
      <p className={cn("mt-2 px-1 text-sm", light ? "text-white/60" : "text-gray-300")}>—</p>
    );
  }

  if (kind === "text" || kind === "date") {
    return (
      <input
        type={kind === "date" ? "date" : "text"}
        value={value}
        aria-label={field.label}
        placeholder={kind === "text" ? "اكتب هنا…" : undefined}
        onChange={(e) => set(e.target.value)}
        className={cn(
          "mt-2 block w-full border-0 border-b border-dashed bg-transparent px-1 py-1 text-sm outline-none placeholder:text-gray-300 focus:border-solid",
          light ? "border-white/60 text-white placeholder:text-white/50" : "border-gray-300 text-gray-800 focus:border-[#00AFA0]"
        )}
      />
    );
  }

  return (
    <AutoTextarea
      value={value}
      rows={field.rows ?? 3}
      ruled={ruled}
      ariaLabel={field.label}
      onChange={set}
      className={light ? "text-white placeholder:text-white/50 focus:bg-white/10" : undefined}
    />
  );
}

function FieldLabel({ field, color = LABEL, center }: { field: PracticeField; color?: string; center?: boolean }) {
  return (
    <div className={center ? "text-center" : undefined}>
      <p className="text-sm font-bold md:text-base" style={{ color }}>
        {field.label}
      </p>
      {field.hint && (
        <p className="mt-0.5 text-xs leading-5" style={{ color: HINT }}>
          {field.hint}
        </p>
      )}
    </div>
  );
}

/** White box with a coloured bar on its start (right) edge. */
function FieldBox({ field, view, className }: { field: PracticeField; view: ViewProps; className?: string }) {
  return (
    <div
      className={cn("min-w-0 rounded-lg border bg-white px-4 py-3", className)}
      style={{ borderColor: BOX_BORDER, borderInlineStartWidth: 6, borderInlineStartColor: accent(field.tone) }}
    >
      <FieldLabel field={field} />
      <FieldValue field={field} view={view} />
    </div>
  );
}

function Banner({ section, view }: { section: Extract<PracticeSection, { type: "banner" }>; view: ViewProps }) {
  return (
    <div className="rounded-xl border-2 px-4 py-4 md:px-6" style={{ background: tint(section.tone), borderColor: accent(section.tone) }}>
      {section.title && (
        <p className="mb-2 font-bold" style={{ color: accent(section.tone) }}>
          {section.title}
        </p>
      )}
      <div className={cn("grid grid-cols-1 gap-4", ROW_COLS[section.cols ?? 1])}>
        {section.fields.map((field) => (
          <div key={field.key} className="min-w-0">
            <FieldLabel field={field} color={accent(section.tone)} />
            <FieldValue field={field} view={view} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Matrix({ section, view }: { section: Extract<PracticeSection, { type: "matrix" }>; view: ViewProps }) {
  const caption = (i: number) => `${section.rowAxis[i < 2 ? 0 : 1]} · ${section.colAxis[i % 2 === 0 ? 0 : 1]}`;
  return (
    <div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[auto_1fr] md:gap-x-4 md:gap-y-2">
        {/* Influence axis: high at the top, low at the bottom */}
        <div className="hidden flex-col justify-between py-3 text-sm font-bold md:flex">
          <span style={{ color: accent("purple") }}>{section.rowAxis[0]}</span>
          <span className="text-gray-500">{section.rowAxis[1]}</span>
        </div>
        <div className="grid grid-cols-1 overflow-hidden rounded-md md:grid-cols-2 md:border-2 md:border-gray-700">
          {section.cells.map((cell, i) => (
            <div
              key={cell.key}
              className={cn(
                "min-w-0 px-4 py-4 md:min-h-[14rem]",
                "max-md:mb-3 max-md:rounded-lg max-md:border",
                i % 2 === 0 && "md:border-e md:border-gray-700",
                i < 2 && "md:border-b md:border-gray-700"
              )}
              style={{ background: tint(cell.tone) }}
            >
              <p className="mb-1 text-center text-xs text-gray-500 md:hidden">{caption(i)}</p>
              <FieldLabel field={cell} color={cell.tone === "gray" ? "#4B5563" : accent(cell.tone)} center />
              <FieldValue field={cell} view={view} />
            </div>
          ))}
        </div>
        {/* Affected axis: high at the start (right), low at the end */}
        <div className="hidden md:block" />
        <div className="hidden justify-between text-sm font-bold md:flex">
          <span style={{ color: accent("purple") }}>{section.colAxis[0]}</span>
          <span className="text-gray-500">{section.colAxis[1]}</span>
        </div>
      </div>
      {section.note && <p className="mt-2 text-center text-xs text-gray-400">{section.note}</p>}
    </div>
  );
}

/** Lines joining three boxes to the one central box (drawn on md and up). */
function TreeConnector({ tone, flip }: { tone: PracticeTone; flip?: boolean }) {
  const color = accent(tone);
  return (
    <div aria-hidden className={cn("relative hidden h-8 md:block", flip && "rotate-180")}>
      <div className="absolute top-0 h-4 border-x-2 border-b-2" style={{ insetInline: "16.66%", borderColor: color }} />
      <div className="absolute top-0 h-4 border-s-2" style={{ insetInlineStart: "50%", borderColor: color }} />
      <div className="absolute bottom-0 top-4 border-s-2" style={{ insetInlineStart: "50%", borderColor: color }} />
    </div>
  );
}

function Tree({ section, view }: { section: Extract<PracticeSection, { type: "tree" }>; view: ViewProps }) {
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {section.top.map((field) => (
          <FieldBox key={field.key} field={field} view={view} />
        ))}
      </div>
      <TreeConnector tone={section.topTone} />
      <div className="mx-auto my-4 max-w-xl rounded-xl px-6 py-4 text-center md:my-0" style={{ background: accent(section.centerTone) }}>
        <p className="text-lg font-bold text-white">{section.center.label}</p>
        {section.center.hint && <p className="mt-1 text-xs text-white/80">{section.center.hint}</p>}
        <FieldValue field={section.center} view={view} light />
      </div>
      <TreeConnector tone={section.bottomTone} flip />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {section.bottom.map((stack) => (
          <div key={stack[0].key} className="flex min-w-0 flex-col">
            {stack.map((field, i) => (
              <div key={field.key}>
                {i > 0 && <div aria-hidden className="mx-auto h-4 border-s-2" style={{ width: 0, borderColor: accent(field.tone) }} />}
                <FieldBox field={field} view={view} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Columns({ section, view }: { section: Extract<PracticeSection, { type: "columns" }>; view: ViewProps }) {
  return (
    <div className={cn("grid grid-cols-1 gap-4", COLUMN_COLS[section.columns.length], section.arrows && "lg:gap-6")}>
      {section.columns.map((column, ci) => (
        <div key={column.title} className="relative min-w-0">
          <div className="h-full overflow-hidden rounded-xl border-2 bg-white" style={{ borderColor: accent(column.tone) }}>
            <p className="px-3 py-3 text-center font-bold text-white" style={{ background: accent(column.tone) }}>
              {column.title}
            </p>
            <div className="space-y-4 px-4 py-4">
              {column.hint && <p className="text-center text-xs leading-5" style={{ color: HINT }}>{column.hint}</p>}
              {column.fields.map((field) => (
                <div key={field.key}>
                  {/* A lone field named like its column needs no label of its own */}
                  {field.label !== column.title && <FieldLabel field={field} />}
                  <FieldValue field={field} view={view} ruled />
                </div>
              ))}
            </div>
          </div>
          {section.arrows && ci < section.columns.length - 1 && (
            <ChevronLeft
              aria-hidden
              className="absolute top-1/2 hidden h-5 w-5 -translate-y-1/2 text-gray-400 lg:block"
              style={{ insetInlineEnd: "-1.35rem" }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function Steps({ section, view }: { section: Extract<PracticeSection, { type: "steps" }>; view: ViewProps }) {
  return (
    <div>
      {section.title && <p className="mb-3 font-bold text-gray-800">{section.title}</p>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-8">
        {section.steps.map((step, i) => (
          <div key={step.key} className="min-w-0 rounded-xl border-2 px-4 py-4" style={{ background: tint(step.tone), borderColor: accent(step.tone) }}>
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold text-white"
                style={{ background: accent(step.tone) }}
              >
                {i + 1}
              </span>
              <p className="font-bold" style={{ color: LABEL }}>
                {step.label}
              </p>
            </div>
            <FieldValue field={step} view={view} ruled />
          </div>
        ))}
      </div>
    </div>
  );
}

function Panels({ section, view }: { section: Extract<PracticeSection, { type: "panels" }>; view: ViewProps }) {
  return (
    <div className={cn("grid grid-cols-1 gap-6", section.template)}>
      {section.panels.map((panel) => {
        if (panel.variant === "circle") {
          // The round beneficiary profile: sections stacked and split by lines
          const fields = panel.sections.flatMap((s) => (s.type === "row" ? s.fields : []));
          return (
            <div key={panel.title} className="min-w-0">
              <p className="mb-2 text-center text-lg font-bold" style={{ color: accent(panel.tone) }}>
                {panel.title}
              </p>
              <div
                className="rounded-[2.5rem] border-2 px-6 py-6 lg:rounded-[50%] lg:px-14 lg:py-14"
                style={{ background: tint(panel.tone), borderColor: accent(panel.tone) }}
              >
                {fields.map((field, i) => (
                  <div key={field.key} className={cn("py-3", i > 0 && "border-t")} style={{ borderColor: "#E2C9DB" }}>
                    <FieldLabel field={field} color={accent(field.tone)} center />
                    <FieldValue field={field} view={view} />
                  </div>
                ))}
              </div>
            </div>
          );
        }
        return (
          <div
            key={panel.title}
            className="min-w-0 rounded-2xl border-2 px-4 py-4 md:px-6"
            style={{ background: tint(panel.tone), borderColor: accent(panel.tone) }}
          >
            <p className="mx-auto mb-4 w-fit rounded-lg px-5 py-2 text-center font-bold text-white" style={{ background: accent(panel.tone) }}>
              {panel.title}
            </p>
            <div className="space-y-4">
              <Sections sections={panel.sections} view={view} />
            </div>
            {panel.note && (
              <p className="mt-4 text-center text-sm font-bold" style={{ color: accent(panel.tone) }}>
                {panel.note}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Sections({ sections, view }: { sections: PracticeSection[]; view: ViewProps }) {
  return (
    <>
      {sections.map((section, i) => {
        let content: ReactNode;
        switch (section.type) {
          case "row":
            content = (
              <div className={cn("grid grid-cols-1 gap-4", ROW_COLS[section.cols])}>
                {section.fields.map((field) => (
                  <FieldBox key={field.key} field={field} view={view} className={field.span ? COL_SPAN[field.span] : undefined} />
                ))}
              </div>
            );
            break;
          case "heading":
            content = <p className="font-bold text-gray-800">{section.text}</p>;
            break;
          case "banner":
            content = <Banner section={section} view={view} />;
            break;
          case "matrix":
            content = <Matrix section={section} view={view} />;
            break;
          case "tree":
            content = <Tree section={section} view={view} />;
            break;
          case "columns":
            content = <Columns section={section} view={view} />;
            break;
          case "steps":
            content = <Steps section={section} view={view} />;
            break;
          case "panels":
            content = <Panels section={section} view={view} />;
            break;
        }
        return <div key={i}>{content}</div>;
      })}
    </>
  );
}

export default function PracticeCardView({
  card,
  answers,
  editable = false,
  onChange,
}: {
  card: PracticeCard;
  answers: PracticeAnswers;
  editable?: boolean;
  onChange?: (key: string, value: string) => void;
}) {
  const view: ViewProps = { answers, editable, onChange };
  return (
    <article dir="rtl" className="overflow-hidden rounded-2xl border bg-white shadow-sm">
      <div aria-hidden className="h-2" style={{ background: accent("teal") }} />
      <header className="flex items-start justify-between gap-4 px-4 pb-2 pt-5 md:px-8 md:pt-7">
        <div className="min-w-0">
          <h2 className="text-xl font-bold md:text-3xl" style={{ color: accent("purple") }}>
            {card.title}
          </h2>
          <p className="mt-1 text-sm text-gray-500">{card.subtitle}</p>
        </div>
        <span
          className="flex h-12 w-14 shrink-0 items-center justify-center rounded-lg text-xl font-bold text-white md:h-14 md:w-16"
          style={{ background: accent("purple") }}
        >
          {card.number}
        </span>
      </header>
      <div className="space-y-5 px-4 py-5 md:px-8 md:py-6">
        <Sections sections={card.sections} view={view} />
      </div>
      <footer className="mx-4 border-t py-3 text-end text-xs font-semibold md:mx-8" style={{ color: accent("purple") }}>
        {card.number} من {PRACTICE_CARD_COUNT}
      </footer>
    </article>
  );
}
