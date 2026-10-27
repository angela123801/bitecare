import { type ReactNode, isValidElement } from 'react';

/**
 * Lightweight Markdown renderer for education content. Supports headings (##,
 * ###), numbered and bulleted lists, bold (**text**), and paragraphs — the
 * subset used by the seeded education articles. No raw HTML is emitted; every
 * text node is rendered as a React element, so there is no XSS surface.
 */

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  parts.forEach((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      nodes.push(<strong key={`${keyBase}-b-${i}`}>{part.slice(2, -2)}</strong>);
    } else if (part) {
      nodes.push(<span key={`${keyBase}-t-${i}`}>{part}</span>);
    }
  });
  return nodes;
}

export function MarkdownContent({ content }: { content: string }) {
  const lines = content.split('\n');
  const blocks: ReactNode[] = [];
  let listItems: ReactNode[] = [];
  let listType: 'ordered' | 'unordered' | null = null;
  let paragraph: string[] = [];

  const flushList = () => {
    if (listItems.length === 0) return;
    const key = `list-${blocks.length}`;
    if (listType === 'ordered') {
      blocks.push(<ol key={key} className="list-decimal pl-6 space-y-1">{listItems}</ol>);
    } else {
      blocks.push(<ul key={key} className="list-disc pl-6 space-y-1">{listItems}</ul>);
    }
    listItems = [];
    listType = null;
  };

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join(' ').trim();
    if (text) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="leading-relaxed">
          {renderInline(text, `p-${blocks.length}`)}
        </p>,
      );
    }
    paragraph = [];
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    if (trimmed === '') {
      flushAll();
      return;
    }

    const h2 = trimmed.match(/^##\s+(.+)$/);
    if (h2) {
      flushAll();
      blocks.push(
        <h2 key={`h2-${idx}`} className="text-xl font-bold text-gray-900 mt-5 mb-2">
          {renderInline(h2[1], `h2-${idx}`)}
        </h2>,
      );
      return;
    }

    const h3 = trimmed.match(/^###\s+(.+)$/);
    if (h3) {
      flushAll();
      blocks.push(
        <h3 key={`h3-${idx}`} className="text-lg font-semibold text-gray-900 mt-4 mb-1.5">
          {renderInline(h3[1], `h3-${idx}`)}
        </h3>,
      );
      return;
    }

    const ordered = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listType !== 'ordered') {
        flushList();
        listType = 'ordered';
      }
      listItems.push(
        <li key={`li-${idx}`} className="leading-relaxed">
          {renderInline(ordered[2], `li-${idx}`)}
        </li>,
      );
      return;
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (listType !== 'unordered') {
        flushList();
        listType = 'unordered';
      }
      listItems.push(
        <li key={`li-${idx}`} className="leading-relaxed">
          {renderInline(unordered[1], `li-${idx}`)}
        </li>,
      );
      return;
    }

    flushList();
    paragraph.push(trimmed);
  });

  flushAll();

  // Ensure every block is a valid React element (type safety guard).
  return (
    <div className="space-y-3">
      {blocks.filter((b) => b !== null && b !== undefined && (typeof b === 'string' || isValidElement(b)))}
    </div>
  );
}
