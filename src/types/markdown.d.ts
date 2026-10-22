// Markdown imports resolve to the file's text (see the webpack rule in next.config.js)
declare module "*.md" {
  const content: string;
  export default content;
}
