import termsMarkdown from "../content/terms.md";

/*
 * The terms and conditions, written in ../content/terms.md. Used by the /terms
 * page and by the terms dialog on /register-team. The file only uses a title
 * (#), section headings (##), paragraphs and numbered lists, so a small parser
 * is enough here.
 */

type Block =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; items: string[] };

function parseTerms(markdown: string) {
  let title = "";
  const blocks: Block[] = [];

  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    const item = line.match(/^\d+\.\s+(.*)$/);
    const last = blocks[blocks.length - 1];
    if (line.startsWith("## ")) {
      blocks.push({ kind: "heading", text: line.slice(3) });
    } else if (line.startsWith("# ")) {
      title = line.slice(2);
    } else if (item) {
      if (last?.kind === "list") last.items.push(item[1]);
      else blocks.push({ kind: "list", items: [item[1]] });
    } else {
      blocks.push({ kind: "paragraph", text: line });
    }
  }

  return { title, blocks };
}

const terms = parseTerms(termsMarkdown);

export const TERMS_TITLE = terms.title;

// Web addresses and emails inside the text become links
const LINK_PATTERN = /(https?:\/\/[^\s)]+|[\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g;

function TermsText({ text }: { text: string }) {
  return (
    <>
      {text.split(LINK_PATTERN).map((part, i) => {
        if (i % 2 === 0) return part;
        const isEmail = !part.startsWith("http");
        return (
          <a
            key={i}
            href={isEmail ? `mailto:${part}` : part}
            dir="ltr"
            className="font-semibold text-primary underline underline-offset-4 hover:text-accent"
            {...(isEmail ? {} : { target: "_blank", rel: "noopener noreferrer" })}
          >
            {part}
          </a>
        );
      })}
    </>
  );
}

/** The terms' sections, without the title (each caller shows its own). */
export function TermsBody() {
  return (
    <div className="space-y-4 text-base leading-loose text-foreground/85 arabic-text">
      {terms.blocks.map((block, i) => {
        if (block.kind === "heading") {
          return (
            <h2 key={i} className="pt-4 text-xl font-bold text-primary first:pt-0">
              {block.text}
            </h2>
          );
        }
        if (block.kind === "list") {
          return (
            <ol key={i} className="list-decimal space-y-2 ps-6 marker:font-bold marker:text-primary">
              {block.items.map((text, j) => (
                <li key={j}>
                  <TermsText text={text} />
                </li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i}>
            <TermsText text={block.text} />
          </p>
        );
      })}
    </div>
  );
}
