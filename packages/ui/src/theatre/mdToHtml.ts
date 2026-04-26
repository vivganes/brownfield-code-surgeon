function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inlineMarkdown(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function parseTableRow(line: string): string[] {
  return line
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

const TABLE_SEP_RE = /^\|[-| :]+\|/;

export function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;
  let inCodeBlock = false;
  let inList = false;

  const closeList = (): void => {
    if (inList) { out.push("</ul>"); inList = false; }
  };

  while (i < lines.length) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const line = lines[i]!;

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        out.push("</code></pre>");
        inCodeBlock = false;
      } else {
        closeList();
        const lang = line.slice(3).trim();
        out.push(`<pre><code${lang ? ` class="lang-${escapeHtml(lang)}"` : ""}>`);
        inCodeBlock = true;
      }
      i++; continue;
    }

    if (inCodeBlock) {
      out.push(escapeHtml(line) + "\n");
      i++; continue;
    }

    if (line.startsWith("|") && TABLE_SEP_RE.test(lines[i + 1] ?? "")) {
      closeList();
      const headers = parseTableRow(line);
      i += 2;
      out.push("<table><thead><tr>");
      for (const h of headers) out.push(`<th>${inlineMarkdown(h)}</th>`);
      out.push("</tr></thead><tbody>");
      while (i < lines.length && lines[i]!.startsWith("|")) {
        out.push("<tr>");
        for (const cell of parseTableRow(lines[i]!)) {
          out.push(`<td>${inlineMarkdown(cell)}</td>`);
        }
        out.push("</tr>");
        i++;
      }
      out.push("</tbody></table>");
      continue;
    }

    const isBullet = /^[-*] /.test(line) || /^\d+\.\s/.test(line);
    if (!isBullet) closeList();

    if (line.startsWith("# ")) {
      out.push(`<h1>${inlineMarkdown(line.slice(2))}</h1>`);
    } else if (line.startsWith("## ")) {
      out.push(`<h2>${inlineMarkdown(line.slice(3))}</h2>`);
    } else if (line.startsWith("### ")) {
      out.push(`<h3>${inlineMarkdown(line.slice(4))}</h3>`);
    } else if (line.startsWith("#### ")) {
      out.push(`<h4>${inlineMarkdown(line.slice(5))}</h4>`);
    } else if (isBullet) {
      if (!inList) { out.push("<ul>"); inList = true; }
      const text = line.replace(/^[-*] /, "").replace(/^\d+\.\s+/, "");
      out.push(`<li>${inlineMarkdown(text)}</li>`);
    } else if (line.trim() === "") {
      out.push("<br/>");
    } else {
      out.push(`<p>${inlineMarkdown(line)}</p>`);
    }
    i++;
  }

  closeList();
  if (inCodeBlock) out.push("</code></pre>");

  return out.join("");
}
