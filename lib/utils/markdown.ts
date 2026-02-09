const inlinePatterns = {
  code: /`([^`]+)`/g,
  bold: /\*\*([^*]+)\*\*/g,
  italicAsterisk: /\*([^*]+)\*/g,
  italicUnderscore: /_([^_]+)_/g,
  link: /\[([^\]]+)\]\(([^)]+)\)/g,
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applyInlineFormatting(text: string): string {
  const escaped = escapeHtml(text);

  return escaped
    .replace(inlinePatterns.link, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(inlinePatterns.code, '<code>$1</code>')
    .replace(inlinePatterns.bold, '<strong>$1</strong>')
    .replace(inlinePatterns.italicAsterisk, '<em>$1</em>')
    .replace(inlinePatterns.italicUnderscore, '<em>$1</em>');
}

function flushParagraph(lines: string[], output: string[]) {
  if (lines.length === 0) return;
  const paragraph = lines.map(applyInlineFormatting).join('<br />');
  output.push(`<p>${paragraph}</p>`);
  lines.length = 0;
}

export function markdownToHtml(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  const paragraphLines: string[] = [];
  const codeLines: string[] = [];
  let inCodeBlock = false;
  let listType: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (listType) {
      output.push(`</${listType}>`);
      listType = null;
    }
  };

  const openList = (type: 'ul' | 'ol') => {
    if (listType !== type) {
      closeList();
      output.push(`<${type}>`);
      listType = type;
    }
  };

  const flushCodeBlock = () => {
    if (codeLines.length === 0) return;
    const code = escapeHtml(codeLines.join('\n'));
    output.push(`<pre><code>${code}</code></pre>`);
    codeLines.length = 0;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.startsWith('```')) {
      flushParagraph(paragraphLines, output);
      closeList();
      if (inCodeBlock) {
        flushCodeBlock();
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(rawLine);
      continue;
    }

    if (line.trim() === '') {
      flushParagraph(paragraphLines, output);
      closeList();
      continue;
    }

    if (line === '---' || line === '***') {
      flushParagraph(paragraphLines, output);
      closeList();
      output.push('<hr />');
      continue;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph(paragraphLines, output);
      closeList();
      const level = headingMatch[1].length;
      const text = applyInlineFormatting(headingMatch[2]);
      output.push(`<h${level}>${text}</h${level}>`);
      continue;
    }

    if (line.startsWith('> ')) {
      flushParagraph(paragraphLines, output);
      closeList();
      output.push(`<blockquote>${applyInlineFormatting(line.slice(2))}</blockquote>`);
      continue;
    }

    const unorderedMatch = line.match(/^[-*•]\s+(.*)$/);
    if (unorderedMatch) {
      flushParagraph(paragraphLines, output);
      openList('ul');
      output.push(`<li>${applyInlineFormatting(unorderedMatch[1])}</li>`);
      continue;
    }

    const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph(paragraphLines, output);
      openList('ol');
      output.push(`<li>${applyInlineFormatting(orderedMatch[1])}</li>`);
      continue;
    }

    paragraphLines.push(line);
  }

  if (inCodeBlock) {
    flushCodeBlock();
  }

  flushParagraph(paragraphLines, output);
  closeList();

  return output.join('');
}
