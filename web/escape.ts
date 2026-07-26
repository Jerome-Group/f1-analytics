// Upstream's text, drawn as text. A driver code, a circuit name, a race control message — none of
// them is markup, whatever arrives in them, and both the rows and the strip draw feed text, so the
// one escaper lives here rather than once in each.

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
};

/** The value with the four characters that would be markup replaced by their entities. */
export function escapeText(value: string): string {
  return value.replace(/[&<>"]/g, (character) => ENTITIES[character] ?? character);
}
