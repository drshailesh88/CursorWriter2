import {
  Document as DocxDocument,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  UnderlineType,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from 'docx';

type HeadingValue = (typeof HeadingLevel)[keyof typeof HeadingLevel];

type ExportPayload = {
  title?: string;
  content: string;
};

const DEFAULT_FILENAME = 'academic-document';

function sanitizeFileName(title?: string) {
  const baseName = (title || DEFAULT_FILENAME).trim() || DEFAULT_FILENAME;
  return baseName
    .replace(/[\s]+/g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '')
    .toLowerCase();
}

function downloadBlob(blob: Blob, filename: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const url = window.URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  if (anchor.style) {
    anchor.style.display = 'none';
  }
  document.body?.appendChild(anchor);

  if (typeof anchor.click === 'function') {
    anchor.click();
  }

  // Cleanup after a delay to ensure download starts
  setTimeout(() => {
    if (typeof anchor.remove === 'function') {
      anchor.remove();
    } else {
      anchor.parentNode?.removeChild(anchor);
    }
    const runtimeUrl = typeof window !== 'undefined' ? window.URL : globalThis.URL;
    runtimeUrl?.revokeObjectURL?.(url);
  }, 100);
}

type TextFormatting = {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  superscript?: boolean;
};

function createTextRunsFromNode(node: Node, formatting: TextFormatting = {}): TextRun[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.replace(/\s+/g, ' ') ?? '';
    if (!text.trim()) {
      return [];
    }

    return [
      new TextRun({
        text,
        bold: formatting.bold,
        italics: formatting.italics,
        underline: formatting.underline ? { type: UnderlineType.SINGLE } : undefined,
        superScript: formatting.superscript ? true : undefined,
      }),
    ];
  }

  if (!(node instanceof Element)) {
    return [];
  }

  const nextFormatting = { ...formatting };
  const tagName = node.tagName.toLowerCase();

  if (tagName === 'strong' || tagName === 'b') {
    nextFormatting.bold = true;
  }
  if (tagName === 'em' || tagName === 'i') {
    nextFormatting.italics = true;
  }
  if (tagName === 'u') {
    nextFormatting.underline = true;
  }
  if (tagName === 'sup') {
    nextFormatting.superscript = true;
  }

  const runs: TextRun[] = [];
  node.childNodes.forEach((child) => {
    runs.push(...createTextRunsFromNode(child, nextFormatting));
  });

  return runs;
}

function buildTable(tableElement: Element) {
  const rows = Array.from(tableElement.querySelectorAll('tr'));
  const tableRows = rows.map(
    (row) =>
      new TableRow({
        children: Array.from(row.children).map(
          (cell) =>
            new TableCell({
              width: {
                size: 100,
                type: WidthType.PERCENTAGE,
              },
              children: [
                new Paragraph({
                  children: createTextRunsFromNode(cell),
                }),
              ],
            })
        ),
      })
  );

  return new Table({
    rows: tableRows,
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
  });
}

function buildParagraph(
  element: Element,
  options: {
    heading?: HeadingValue;
    bullet?: { level: number };
  } = {}
) {
  const runs = createTextRunsFromNode(element);

  return new Paragraph({
    heading: options.heading,
    bullet: options.bullet,
    spacing: {
      after: 120,
    },
    children: runs.length ? runs : [new TextRun({ text: '' })],
  });
}

function parseHtmlToDocxSections(content: string) {
  if (typeof DOMParser === 'undefined') {
    throw new Error('Docx export requires a DOMParser');
  }

  const parser = new DOMParser();
  const document = parser.parseFromString(content, 'text/html');
  const bodyChildren = Array.from(document.body.children);
  const sections: (Paragraph | Table)[] = [];

  bodyChildren.forEach((child) => {
    const tag = child.tagName.toLowerCase();

    if (tag === 'h1') {
      sections.push(buildParagraph(child, { heading: HeadingLevel.HEADING_1 }));
    } else if (tag === 'h2') {
      sections.push(buildParagraph(child, { heading: HeadingLevel.HEADING_2 }));
    } else if (tag === 'h3') {
      sections.push(buildParagraph(child, { heading: HeadingLevel.HEADING_3 }));
    } else if (tag === 'p' || tag === 'div') {
      sections.push(buildParagraph(child));
    } else if (tag === 'ul' || tag === 'ol') {
      Array.from(child.querySelectorAll('li')).forEach((li) => {
        sections.push(
          buildParagraph(li, {
            bullet: { level: 0 },
          })
        );
      });
    } else if (tag === 'table') {
      sections.push(buildTable(child));
    } else {
      sections.push(buildParagraph(child));
    }
  });

  return sections;
}

export async function exportDocumentToDocx(payload: ExportPayload) {
  if (typeof window === 'undefined') {
    throw new Error('Docx export must be initiated from the browser');
  }

  const { title, content } = payload;
  const sections = parseHtmlToDocxSections(content);

  const doc = new DocxDocument({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.TITLE,
            spacing: { after: 240 },
            children: [new TextRun({ text: title || 'Academic Writing Document', bold: true })],
          }),
          ...sections,
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const filename = `${sanitizeFileName(title)}.docx`;
  downloadBlob(blob, filename);
}
