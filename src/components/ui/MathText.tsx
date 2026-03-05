'use client';

import React, { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MathTextProps {
  text: string;
  className?: string;
  as?: 'span' | 'p' | 'div' | 'h2' | 'h3';
}

/**
 * Renders text that may contain LaTeX math expressions.
 * Inline math: $...$  |  Display math: $$...$$
 * Non-math text is rendered as plain text (sanitized, no HTML injection).
 */
export function MathText({ text, className, as: Tag = 'span' }: MathTextProps) {
  const rendered = useMemo(() => {
    if (!text) return [];
    // Quick check: if no $ at all, skip regex
    if (!text.includes('$')) return [{ type: 'text' as const, content: text }];

    const parts: { type: 'text' | 'math'; content: string; display?: boolean }[] = [];
    // Match $$...$$ (display) and $...$ (inline), non-greedy
    const regex = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: text.slice(lastIndex, match.index) });
      }
      if (match[1] !== undefined) {
        // Display math $$...$$
        parts.push({ type: 'math', content: match[1], display: true });
      } else if (match[2] !== undefined) {
        // Inline math $...$
        parts.push({ type: 'math', content: match[2], display: false });
      }
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: text.slice(lastIndex) });
    }

    return parts;
  }, [text]);

  if (rendered.length === 1 && rendered[0].type === 'text') {
    return <Tag className={className}>{rendered[0].content}</Tag>;
  }

  return (
    <Tag className={className}>
      {rendered.map((part, i) => {
        if (part.type === 'text') {
          return <React.Fragment key={i}>{part.content}</React.Fragment>;
        }
        try {
          const html = katex.renderToString(part.content, {
            displayMode: part.display ?? false,
            throwOnError: false,
            trust: false,
            strict: false,
          });
          return (
            <span
              key={i}
              dangerouslySetInnerHTML={{ __html: html }}
              className={part.display ? 'block my-2 text-center' : 'inline'}
            />
          );
        } catch {
          // Render raw LaTeX if KaTeX fails
          return <code key={i} className="text-red-500">{part.content}</code>;
        }
      })}
    </Tag>
  );
}
