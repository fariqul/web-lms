'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Modal } from '@/components/ui';
import {
  FileText,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Trash2,
  Eye,
  ArrowRight,
  Info,
  Upload,
  FileUp,
  RefreshCw,
  Download,
} from 'lucide-react';
import { Document, Paragraph, TextRun, Packer, AlignmentType, LevelFormat, convertInchesToTwip } from 'docx';
import { saveAs } from 'file-saver';

// ─── OMML (Office Math Markup Language) extraction ───
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

function childrenNS(parent: Element, ns: string, tag: string): Element[] {
  return Array.from(parent.children).filter(c => c.localName === tag && c.namespaceURI === ns);
}

function mVal(el: Element): string {
  return el.getAttributeNS(M_NS, 'val') || el.getAttribute('m:val') || el.getAttribute('val') || '';
}

/** Convert OMML math XML to readable text (fractions, superscripts, functions, etc.) */
function mathToText(el: Element): string {
  let out = '';
  for (const ch of Array.from(el.children)) {
    if (ch.namespaceURI === W_NS && ch.localName === 'r') {
      for (const t of childrenNS(ch, W_NS, 't')) out += t.textContent || '';
      continue;
    }
    if (ch.namespaceURI !== M_NS) continue;
    switch (ch.localName) {
      case 'r':
        for (const t of childrenNS(ch, M_NS, 't')) out += t.textContent || '';
        break;
      case 'f': { // Fraction: (num/den)
        const n = childrenNS(ch, M_NS, 'num')[0];
        const d = childrenNS(ch, M_NS, 'den')[0];
        out += '(' + (n ? mathToText(n) : '') + '/' + (d ? mathToText(d) : '') + ')';
        break;
      }
      case 'sSup': { // Superscript: base^(exp)
        const e = childrenNS(ch, M_NS, 'e')[0];
        const s = childrenNS(ch, M_NS, 'sup')[0];
        out += (e ? mathToText(e) : '') + '^(' + (s ? mathToText(s) : '') + ')';
        break;
      }
      case 'sSub': { // Subscript: base_(sub)
        const e = childrenNS(ch, M_NS, 'e')[0];
        const s = childrenNS(ch, M_NS, 'sub')[0];
        out += (e ? mathToText(e) : '') + '_(' + (s ? mathToText(s) : '') + ')';
        break;
      }
      case 'sSubSup': { // Sub-superscript combo
        const e = childrenNS(ch, M_NS, 'e')[0];
        const sub = childrenNS(ch, M_NS, 'sub')[0];
        const sup = childrenNS(ch, M_NS, 'sup')[0];
        out += e ? mathToText(e) : '';
        if (sub) out += '_(' + mathToText(sub) + ')';
        if (sup) out += '^(' + mathToText(sup) + ')';
        break;
      }
      case 'rad': { // Radical: √(x)
        const deg = childrenNS(ch, M_NS, 'deg')[0];
        const e = childrenNS(ch, M_NS, 'e')[0];
        const dt = deg ? mathToText(deg).trim() : '';
        out += (dt && dt !== '2' ? dt : '') + '√(' + (e ? mathToText(e) : '') + ')';
        break;
      }
      case 'func': { // Function: sin x, cos x, etc.
        const fn = childrenNS(ch, M_NS, 'fName')[0];
        const e = childrenNS(ch, M_NS, 'e')[0];
        out += (fn ? mathToText(fn).trim() : '') + ' ' + (e ? mathToText(e) : '');
        break;
      }
      case 'd': { // Delimiter: (x), [x], {x}
        const pr = childrenNS(ch, M_NS, 'dPr')[0];
        let beg = '(', end = ')';
        if (pr) {
          const b = childrenNS(pr, M_NS, 'begChr')[0];
          const e = childrenNS(pr, M_NS, 'endChr')[0];
          if (b) beg = mVal(b) || '(';
          if (e) end = mVal(e) || ')';
        }
        out += beg + childrenNS(ch, M_NS, 'e').map(e => mathToText(e)).join(', ') + end;
        break;
      }
      case 'nary': { // N-ary: ∑, ∫, etc.
        const pr = childrenNS(ch, M_NS, 'naryPr')[0];
        let chr = '∫';
        if (pr) { const c = childrenNS(pr, M_NS, 'chr')[0]; if (c) chr = mVal(c) || '∫'; }
        const sub = childrenNS(ch, M_NS, 'sub')[0];
        const sup = childrenNS(ch, M_NS, 'sup')[0];
        const e = childrenNS(ch, M_NS, 'e')[0];
        out += chr;
        if (sub) out += '_(' + mathToText(sub) + ')';
        if (sup) out += '^(' + mathToText(sup) + ')';
        if (e) out += ' ' + mathToText(e);
        break;
      }
      case 'bar': case 'acc': case 'borderBox': case 'box': case 'phant': case 'groupChr': {
        const e = childrenNS(ch, M_NS, 'e')[0];
        out += e ? mathToText(e) : '';
        break;
      }
      case 'sPre': { // Pre-sub/superscript
        const sub = childrenNS(ch, M_NS, 'sub')[0];
        const sup = childrenNS(ch, M_NS, 'sup')[0];
        const e = childrenNS(ch, M_NS, 'e')[0];
        if (sup) out += '^(' + mathToText(sup) + ')';
        if (sub) out += '_(' + mathToText(sub) + ')';
        out += e ? mathToText(e) : '';
        break;
      }
      case 'limLow': {
        const e = childrenNS(ch, M_NS, 'e')[0];
        const lim = childrenNS(ch, M_NS, 'lim')[0];
        out += (e ? mathToText(e) : '') + '_(' + (lim ? mathToText(lim) : '') + ')';
        break;
      }
      case 'limUpp': {
        const e = childrenNS(ch, M_NS, 'e')[0];
        const lim = childrenNS(ch, M_NS, 'lim')[0];
        out += (e ? mathToText(e) : '') + '^(' + (lim ? mathToText(lim) : '') + ')';
        break;
      }
      case 'm': { // Matrix
        const rows = childrenNS(ch, M_NS, 'mr');
        out += '[' + rows.map(row => childrenNS(row, M_NS, 'e').map(e => mathToText(e)).join(', ')).join('; ') + ']';
        break;
      }
      case 'eqArr':
        out += childrenNS(ch, M_NS, 'e').map(e => mathToText(e)).join('; ');
        break;
      case 'oMathPara':
        for (const om of childrenNS(ch, M_NS, 'oMath')) out += mathToText(om);
        break;
      case 't':
        out += ch.textContent || '';
        break;
      default:
        if (!ch.localName.endsWith('Pr')) out += mathToText(ch);
    }
  }
  return out;
}

/** Extract text from a Word run <w:r> element */
function wordRunText(r: Element): string {
  let t = '';
  for (const ch of Array.from(r.children)) {
    if (ch.namespaceURI !== W_NS) continue;
    if (ch.localName === 't') t += ch.textContent || '';
    else if (ch.localName === 'tab') t += '\t';
    else if (ch.localName === 'br') t += '\n';
  }
  return t;
}

/** Extract text from a paragraph, including inline math and wrapped elements */
function extractParaText(p: Element): string {
  let t = '';
  for (const ch of Array.from(p.children)) {
    const ns = ch.namespaceURI;
    const tag = ch.localName;
    if (ns === W_NS && tag === 'r') t += wordRunText(ch);
    else if (ns === M_NS && tag === 'oMath') t += mathToText(ch);
    else if (ns === M_NS && tag === 'oMathPara') {
      for (const om of childrenNS(ch, M_NS, 'oMath')) t += mathToText(om);
    } else if (ns === W_NS && (tag === 'pPr' || tag === 'del' || tag === 'moveFrom' || tag === 'bookmarkStart' || tag === 'bookmarkEnd' || tag === 'proofErr')) {
      // skip non-content elements
    } else if (ch.nodeType === Node.ELEMENT_NODE) {
      // Recurse into wrappers: hyperlink, sdt, ins, smartTag, etc.
      t += extractParaText(ch as Element);
    }
  }
  return t;
}

/** Parse numbering definitions from word/numbering.xml */
interface NumFormat { fmt: string; start: number; lvlText: string; }
interface NumDef { abstractNumId: string; levels: Map<number, NumFormat>; }

function parseNumberingXml(xmlStr: string): { numMap: Map<string, NumDef>; abstractMap: Map<string, Map<number, NumFormat>> } {
  const doc = new DOMParser().parseFromString(xmlStr, 'application/xml');
  const abstractMap = new Map<string, Map<number, NumFormat>>();
  const numMap = new Map<string, NumDef>();

  // Parse abstractNum definitions
  for (const an of Array.from(doc.getElementsByTagNameNS(W_NS, 'abstractNum'))) {
    const aid = an.getAttributeNS(W_NS, 'abstractNumId') || an.getAttribute('w:abstractNumId') || '';
    const levels = new Map<number, NumFormat>();
    for (const lvl of Array.from(an.getElementsByTagNameNS(W_NS, 'lvl'))) {
      const ilvl = parseInt(lvl.getAttributeNS(W_NS, 'ilvl') || lvl.getAttribute('w:ilvl') || '0');
      const numFmtEl = lvl.getElementsByTagNameNS(W_NS, 'numFmt')[0];
      const startEl = lvl.getElementsByTagNameNS(W_NS, 'start')[0];
      const lvlTextEl = lvl.getElementsByTagNameNS(W_NS, 'lvlText')[0];
      const fmt = numFmtEl?.getAttributeNS(W_NS, 'val') || numFmtEl?.getAttribute('w:val') || 'decimal';
      const start = parseInt(startEl?.getAttributeNS(W_NS, 'val') || startEl?.getAttribute('w:val') || '1');
      const lvlText = lvlTextEl?.getAttributeNS(W_NS, 'val') || lvlTextEl?.getAttribute('w:val') || '%1.';
      levels.set(ilvl, { fmt, start, lvlText });
    }
    abstractMap.set(aid, levels);
  }

  // Parse num -> abstractNum mappings
  for (const num of Array.from(doc.getElementsByTagNameNS(W_NS, 'num'))) {
    const numId = num.getAttributeNS(W_NS, 'numId') || num.getAttribute('w:numId') || '';
    const anRef = num.getElementsByTagNameNS(W_NS, 'abstractNumId')[0];
    const aid = anRef?.getAttributeNS(W_NS, 'val') || anRef?.getAttribute('w:val') || '';
    const levels = abstractMap.get(aid) || new Map();
    numMap.set(numId, { abstractNumId: aid, levels });
  }

  return { numMap, abstractMap };
}

/** Format a number according to Word numFmt */
function formatNum(n: number, fmt: string): string {
  switch (fmt) {
    case 'decimal': return String(n);
    case 'lowerLetter': return String.fromCharCode(96 + ((n - 1) % 26) + 1); // a, b, c...
    case 'upperLetter': return String.fromCharCode(64 + ((n - 1) % 26) + 1); // A, B, C...
    case 'lowerRoman': {
      const vals = [1000,'m',900,'cm',500,'d',400,'cd',100,'c',90,'xc',50,'l',40,'xl',10,'x',9,'ix',5,'v',4,'iv',1,'i'];
      let r = '', v = n;
      for (let i = 0; i < vals.length; i += 2) { while (v >= (vals[i] as number)) { r += vals[i+1]; v -= vals[i] as number; } }
      return r;
    }
    case 'upperRoman': {
      const vals = [1000,'M',900,'CM',500,'D',400,'CD',100,'C',90,'XC',50,'L',40,'XL',10,'X',9,'IX',5,'V',4,'IV',1,'I'];
      let r = '', v = n;
      for (let i = 0; i < vals.length; i += 2) { while (v >= (vals[i] as number)) { r += vals[i+1]; v -= vals[i] as number; } }
      return r;
    }
    case 'bullet': return '';
    default: return String(n);
  }
}

/** Parse .docx file with full OMML math support + Word numbering using JSZip + DOMParser */
async function extractDocxWithMath(buf: ArrayBuffer): Promise<string> {
  const jszip = await import('jszip');
  const JSZip = ('default' in jszip ? jszip.default : jszip) as typeof import('jszip');
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('Invalid docx');

  // Parse numbering definitions if available
  const numXml = await zip.file('word/numbering.xml')?.async('string');
  let numMap = new Map<string, NumDef>();
  if (numXml) {
    const parsed = parseNumberingXml(numXml);
    numMap = parsed.numMap;
  }

  // Track counters per numId per level
  const counters = new Map<string, Map<number, number>>();

  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const pars = doc.getElementsByTagNameNS(W_NS, 'p');

  const lines: string[] = [];
  for (const p of Array.from(pars)) {
    let prefix = '';

    // Check for numbering in paragraph properties
    const pPr = p.getElementsByTagNameNS(W_NS, 'pPr')[0];
    if (pPr) {
      const numPr = pPr.getElementsByTagNameNS(W_NS, 'numPr')[0];
      if (numPr) {
        const ilvlEl = numPr.getElementsByTagNameNS(W_NS, 'ilvl')[0];
        const numIdEl = numPr.getElementsByTagNameNS(W_NS, 'numId')[0];
        const ilvl = parseInt(ilvlEl?.getAttributeNS(W_NS, 'val') || ilvlEl?.getAttribute('w:val') || '0');
        const numId = numIdEl?.getAttributeNS(W_NS, 'val') || numIdEl?.getAttribute('w:val') || '';

        if (numId && numId !== '0') {
          const def = numMap.get(numId);
          if (def) {
            const lvl = def.levels.get(ilvl);
            if (lvl) {
              // Get or initialize counter for this numId
              if (!counters.has(numId)) counters.set(numId, new Map());
              const lvlCounters = counters.get(numId)!;

              // Initialize if first time at this level
              if (!lvlCounters.has(ilvl)) lvlCounters.set(ilvl, lvl.start);
              const current = lvlCounters.get(ilvl)!;

              // Reset deeper levels when a higher level item appears
              for (const [k] of lvlCounters) {
                if (k > ilvl) lvlCounters.delete(k);
              }

              if (lvl.fmt !== 'bullet') {
                const formatted = formatNum(current, lvl.fmt);
                // Use lvlText pattern: %1. → "1.", %1) → "1)"
                prefix = lvl.lvlText.replace(/%(\d+)/, formatted) + ' ';
              }

              lvlCounters.set(ilvl, current + 1);
            }
          }
        }
      }
    }

    const text = extractParaText(p);
    if (text.trim() || prefix) {
      lines.push(prefix + text);
    }
  }

  return lines.join('\n');
}

interface ParsedQuestion {
  question_text: string;
  question_type: 'multiple_choice' | 'essay';
  points: number;
  options: { text: string; is_correct: boolean }[];
  valid: boolean;
  error?: string;
}

interface ImportWordModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (questions: ParsedQuestion[]) => Promise<void>;
  existingCount: number;
}

export function ImportWordModal({
  isOpen,
  onClose,
  onImport,
  existingCount,
}: ImportWordModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [parsedQuestions, setParsedQuestions] = useState<ParsedQuestion[]>([]);
  const [step, setStep] = useState<'upload' | 'preview-text' | 'preview-questions'>('upload');
  const [importing, setImporting] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [defaultPoints, setDefaultPoints] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Same parsing logic as ImportTextModal
  const parseText = useCallback((text: string): ParsedQuestion[] => {
    const results: ParsedQuestion[] = [];
    const lines = text.split('\n').map(l => l.trimEnd());

    let currentQuestion: string | null = null;
    let currentOptions: { text: string; is_correct: boolean }[] = [];
    let isEssay = false;

    const flushQuestion = () => {
      if (!currentQuestion) return;
      const qText = currentQuestion.trim();
      if (!qText) return;

      if (isEssay || currentOptions.length === 0) {
        results.push({
          question_text: qText,
          question_type: 'essay',
          points: defaultPoints,
          options: [],
          valid: true,
        });
      } else {
        const hasCorrect = currentOptions.some(o => o.is_correct);
        results.push({
          question_text: qText,
          question_type: 'multiple_choice',
          points: defaultPoints,
          options: currentOptions,
          valid: hasCorrect && currentOptions.length >= 2,
          error: !hasCorrect
            ? 'Tidak ada jawaban benar (tandai dengan * di depan opsi)'
            : currentOptions.length < 2
              ? 'Minimal 2 pilihan jawaban'
              : undefined,
        });
      }

      currentQuestion = null;
      currentOptions = [];
      isEssay = false;
    };

    for (const line of lines) {
      if (!line.trim()) continue;

      // Match question start: "1." or "1)" or just a number at start
      const questionMatch = line.match(/^\s*(\d+)\s*[.)]\s*(.+)/);
      // Match option: "a." "a)" "*a." "*a)" or just "a " with letter
      const optionMatch = line.match(/^\s*(\*?)\s*([a-eA-E])\s*[.)]\s*(.+)/);

      if (questionMatch && !optionMatch) {
        flushQuestion();
        const qText = questionMatch[2].trim();
        // Check if explicitly marked as essay
        if (/\(essay\)\s*$/i.test(qText)) {
          isEssay = true;
          currentQuestion = qText.replace(/\s*\(essay\)\s*$/i, '').trim();
        } else {
          currentQuestion = qText;
        }
      } else if (optionMatch && currentQuestion) {
        const isCorrect = optionMatch[1] === '*';
        const optText = optionMatch[3].trim();
        currentOptions.push({ text: optText, is_correct: isCorrect });
      } else if (currentQuestion) {
        // Continuation of question text
        currentQuestion += ' ' + line.trim();
      }
    }

    flushQuestion();
    return results;
  }, [defaultPoints]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ];
    const isDocx = selectedFile.name.toLowerCase().endsWith('.docx');
    const isDoc = selectedFile.name.toLowerCase().endsWith('.doc');

    if (!validTypes.includes(selectedFile.type) && !isDocx && !isDoc) {
      setError('Format file tidak didukung. Gunakan file .docx');
      return;
    }

    if (isDoc && !isDocx) {
      setError('Format .doc (Word 97-2003) tidak didukung. Simpan ulang file sebagai .docx');
      return;
    }

    // Validate file size (max 10MB)
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('Ukuran file terlalu besar. Maksimal 10MB');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setParsing(true);

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      let text = '';

      try {
        // Custom parser with OMML math support (fractions, sin, cos, etc.)
        text = await extractDocxWithMath(arrayBuffer);
      } catch {
        // Fallback to mammoth if custom parser fails (loses math symbols)
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ arrayBuffer });
        text = result.value;
      }

      text = text.trim();
      if (!text) {
        setError('File Word kosong atau tidak mengandung teks yang dapat dibaca');
        setParsing(false);
        return;
      }

      setExtractedText(text);
      setStep('preview-text');
    } catch (err) {
      console.error('Failed to parse Word file:', err);
      setError('Gagal membaca file Word. Pastikan file tidak rusak dan berformat .docx');
    } finally {
      setParsing(false);
    }
  };

  const handleParseQuestions = () => {
    const parsed = parseText(extractedText);
    setParsedQuestions(parsed);
    setStep('preview-questions');
  };

  const handleRemoveQuestion = (index: number) => {
    setParsedQuestions(prev => prev.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    const validQuestions = parsedQuestions.filter(q => q.valid);
    if (validQuestions.length === 0) return;

    setImporting(true);
    try {
      await onImport(validQuestions);
      handleClose();
    } catch {
      // Error handled by parent
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    const doc = new Document({
      numbering: {
        config: [
          {
            reference: 'soal-numbering',
            levels: [{
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: convertInchesToTwip(0.25), hanging: convertInchesToTwip(0.25) } } },
            }],
          },
          {
            reference: 'opsi-numbering',
            levels: [{
              level: 0,
              format: LevelFormat.LOWER_LETTER,
              text: '%1.',
              alignment: AlignmentType.START,
              style: { paragraph: { indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.25) } } },
            }],
          },
        ],
      },
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            children: [
              new TextRun({ text: 'TEMPLATE SOAL UJIAN', bold: true, size: 28 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({ text: 'Petunjuk:', bold: true, size: 20 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: '- Nomor soal dan pilihan jawaban menggunakan fitur Numbering/List di Word', size: 20 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: '- Bisa juga ketik manual: 1. Teks soal, a. Opsi jawaban', size: 20 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: '- Tandai jawaban benar dengan tanda * di awal teks opsi, contoh: *Jakarta', size: 20 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: '- Untuk soal essay, tambahkan (essay) di akhir soal', size: 20 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: '- Minimal 2 pilihan jawaban untuk soal pilihan ganda', size: 20 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({ text: '- Simbol matematika (sin, cos, fraksi, akar) akan otomatis terbaca', size: 20 }),
            ],
          }),
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({ text: '──────────────────────────────────', size: 20, color: '999999' }),
            ],
          }),
          // Soal 1 - Pilihan Ganda (pakai numbering Word)
          new Paragraph({
            spacing: { after: 40 },
            numbering: { reference: 'soal-numbering', level: 0 },
            children: [new TextRun({ text: 'Apa ibu kota Indonesia?', size: 22 })],
          }),
          new Paragraph({
            spacing: { after: 40 },
            numbering: { reference: 'opsi-numbering', level: 0 },
            children: [new TextRun({ text: 'Surabaya', size: 22 })],
          }),
          new Paragraph({
            spacing: { after: 40 },
            numbering: { reference: 'opsi-numbering', level: 0 },
            children: [new TextRun({ text: 'Bandung', size: 22 })],
          }),
          new Paragraph({
            spacing: { after: 40 },
            numbering: { reference: 'opsi-numbering', level: 0 },
            children: [new TextRun({ text: '*Jakarta', size: 22, bold: true })],
          }),
          new Paragraph({
            spacing: { after: 200 },
            numbering: { reference: 'opsi-numbering', level: 0 },
            children: [new TextRun({ text: 'Medan', size: 22 })],
          }),
          // Soal 2 - Pilihan Ganda  
          new Paragraph({
            spacing: { after: 40 },
            numbering: { reference: 'soal-numbering', level: 0 },
            children: [new TextRun({ text: 'Siapa penemu telepon?', size: 22 })],
          }),
          new Paragraph({
            spacing: { after: 40 },
            numbering: { reference: 'opsi-numbering', level: 0 },
            children: [new TextRun({ text: '*Alexander Graham Bell', size: 22, bold: true })],
          }),
          new Paragraph({
            spacing: { after: 40 },
            numbering: { reference: 'opsi-numbering', level: 0 },
            children: [new TextRun({ text: 'Thomas Edison', size: 22 })],
          }),
          new Paragraph({
            spacing: { after: 40 },
            numbering: { reference: 'opsi-numbering', level: 0 },
            children: [new TextRun({ text: 'Nikola Tesla', size: 22 })],
          }),
          new Paragraph({
            spacing: { after: 200 },
            numbering: { reference: 'opsi-numbering', level: 0 },
            children: [new TextRun({ text: 'Albert Einstein', size: 22 })],
          }),
          // Soal 3 - Essay
          new Paragraph({
            spacing: { after: 200 },
            numbering: { reference: 'soal-numbering', level: 0 },
            children: [new TextRun({ text: 'Jelaskan proses terjadinya fotosintesis! (essay)', size: 22 })],
          }),
          // Soal 4 - Pilihan Ganda
          new Paragraph({
            spacing: { after: 40 },
            numbering: { reference: 'soal-numbering', level: 0 },
            children: [new TextRun({ text: 'Planet terbesar di tata surya adalah?', size: 22 })],
          }),
          new Paragraph({
            spacing: { after: 40 },
            numbering: { reference: 'opsi-numbering', level: 0 },
            children: [new TextRun({ text: 'Mars', size: 22 })],
          }),
          new Paragraph({
            spacing: { after: 40 },
            numbering: { reference: 'opsi-numbering', level: 0 },
            children: [new TextRun({ text: '*Jupiter', size: 22, bold: true })],
          }),
          new Paragraph({
            spacing: { after: 40 },
            numbering: { reference: 'opsi-numbering', level: 0 },
            children: [new TextRun({ text: 'Saturnus', size: 22 })],
          }),
          new Paragraph({
            spacing: { after: 200 },
            numbering: { reference: 'opsi-numbering', level: 0 },
            children: [new TextRun({ text: 'Venus', size: 22 })],
          }),
          // Soal 5 - Essay
          new Paragraph({
            spacing: { after: 200 },
            numbering: { reference: 'soal-numbering', level: 0 },
            children: [new TextRun({ text: 'Sebutkan dan jelaskan 3 jenis batuan yang ada di bumi! (essay)', size: 22 })],
          }),
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, 'template_soal_ujian.docx');
  };

  const handleClose = () => {
    setFile(null);
    setExtractedText('');
    setParsedQuestions([]);
    setStep('upload');
    setImporting(false);
    setParsing(false);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClose();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      // Simulate file input change
      const dt = new DataTransfer();
      dt.items.add(droppedFile);
      if (fileInputRef.current) {
        fileInputRef.current.files = dt.files;
        fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
      }
      // Manually trigger
      handleFileChange({ target: { files: dt.files } } as React.ChangeEvent<HTMLInputElement>);
    }
  };

  const validCount = parsedQuestions.filter(q => q.valid).length;
  const invalidCount = parsedQuestions.filter(q => !q.valid).length;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="" size="xl">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3 pb-4 border-b border-slate-200 dark:border-slate-700">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Import dari Word
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Upload file .docx — mendukung fitur Numbering Word &amp; simbol matematika
            </p>
          </div>
        </div>

        {step === 'upload' && (
          <>
            {/* Format Guide */}
            <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
              <div className="flex items-start gap-2.5">
                <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                <div className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                  <p className="font-semibold">Format penulisan di Word:</p>
                  <ul className="list-disc ml-4 space-y-0.5 text-blue-700 dark:text-blue-300">
                    <li>Nomor soal: pakai fitur <strong>Numbering</strong> (1. 2. 3.) atau ketik manual</li>
                    <li>Opsi jawaban: pakai fitur <strong>Numbering huruf</strong> (a. b. c.) atau ketik manual</li>
                    <li>Tandai jawaban benar: awali teks opsi dengan <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded text-xs">*</code> contoh: <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded text-xs">*Jakarta</code></li>
                    <li>Soal essay: tambahkan <code className="bg-blue-100 dark:bg-blue-800/50 px-1 rounded text-xs">(essay)</code> di akhir soal</li>
                    <li>Simbol matematika (sin, cos, fraksi, akar) otomatis terbaca</li>
                  </ul>
                  <p className="text-blue-600 dark:text-blue-400 mt-2 text-xs">
                    Download template untuk contoh format yang benar.
                  </p>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDownloadTemplate(); }}
                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-800/40 hover:bg-blue-200 dark:hover:bg-blue-800/60 rounded-lg transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download Template Word
                  </button>
                </div>
              </div>
            </div>

            {/* Default Points */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Poin per soal:
              </label>
              <input
                type="number"
                value={defaultPoints}
                onChange={(e) => setDefaultPoints(parseInt(e.target.value) || 10)}
                min={1}
                max={100}
                className="w-20 px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* File Upload Area */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                error
                  ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/10'
                  : file
                    ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/10'
                    : 'border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-900/10'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.doc"
                onChange={handleFileChange}
                className="hidden"
              />
              
              {parsing ? (
                <div className="space-y-3">
                  <Loader2 className="w-10 h-10 mx-auto text-blue-500 animate-spin" />
                  <p className="text-sm font-medium text-blue-600 dark:text-blue-400">Membaca file Word...</p>
                </div>
              ) : file && !error ? (
                <div className="space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800 dark:text-white">{file.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <Upload className="w-6 h-6 text-slate-400 dark:text-slate-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Drag & drop file Word atau <span className="text-blue-600 dark:text-blue-400 underline underline-offset-2">klik untuk pilih</span>
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                      Format: .docx (maks 10MB)
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Batal
              </button>
            </div>
          </>
        )}

        {step === 'preview-text' && (
          <>
            {/* Extracted Text Preview */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Teks dari: <span className="text-blue-600 dark:text-blue-400">{file?.name}</span>
                </span>
              </div>
              <span className="text-xs text-slate-400">{extractedText.split('\n').filter(l => l.trim()).length} baris</span>
            </div>

            <textarea
              value={extractedText}
              onChange={(e) => setExtractedText(e.target.value)}
              rows={14}
              className="w-full px-4 py-3 text-sm border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono leading-relaxed resize-none"
              placeholder="Teks dari file Word..."
            />

            <p className="text-xs text-slate-400 dark:text-slate-500">
              Anda bisa mengedit teks di atas sebelum melanjutkan ke preview soal.
            </p>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => {
                  setStep('upload');
                  setFile(null);
                  setExtractedText('');
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Ganti File
              </button>
              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={handleParseQuestions}
                  disabled={!extractedText.trim()}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 rounded-lg shadow-md shadow-blue-500/20 transition-all"
                >
                  <Eye className="w-4 h-4" />
                  Preview Soal
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}

        {step === 'preview-questions' && (
          <>
            {/* Preview Stats */}
            <div className="flex gap-3">
              <div className="flex-1 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 text-center">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{validCount}</p>
                <p className="text-xs text-green-700 dark:text-green-300">Soal Valid</p>
              </div>
              {invalidCount > 0 && (
                <div className="flex-1 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-center">
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{invalidCount}</p>
                  <p className="text-xs text-amber-700 dark:text-amber-300">Perlu Perbaikan</p>
                </div>
              )}
              <div className="flex-1 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 text-center">
                <p className="text-2xl font-bold text-slate-600 dark:text-slate-300">{existingCount}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Soal Existing</p>
              </div>
            </div>

            {/* Parsed Questions List */}
            <div className="max-h-[400px] overflow-y-auto space-y-3 pr-1">
              {parsedQuestions.map((q, idx) => (
                <div
                  key={idx}
                  className={`rounded-xl border p-4 transition-colors ${
                    q.valid
                      ? 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                      : 'bg-amber-50 dark:bg-amber-900/10 border-amber-300 dark:border-amber-700'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-300 shrink-0">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 dark:text-white font-medium mb-1">
                        {q.question_text}
                      </p>

                      {q.question_type === 'multiple_choice' && q.options.length > 0 && (
                        <div className="space-y-1 ml-1 mt-2">
                          {q.options.map((opt, oi) => (
                            <div
                              key={oi}
                              className={`flex items-center gap-2 text-xs ${
                                opt.is_correct
                                  ? 'text-green-600 dark:text-green-400 font-semibold'
                                  : 'text-slate-500 dark:text-slate-400'
                              }`}
                            >
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                                opt.is_correct
                                  ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                                  : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                              }`}>
                                {String.fromCharCode(65 + oi)}
                              </span>
                              {opt.text}
                              {opt.is_correct && <CheckCircle className="w-3.5 h-3.5" />}
                            </div>
                          ))}
                        </div>
                      )}

                      {q.question_type === 'essay' && (
                        <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md">
                          Essay
                        </span>
                      )}

                      {!q.valid && q.error && (
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          {q.error}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemoveQuestion(idx)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors shrink-0"
                      title="Hapus soal ini"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {parsedQuestions.length === 0 && (
              <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Tidak ada soal terdeteksi</p>
                <p className="text-sm mt-1">Periksa format teks di file Word Anda</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setStep('preview-text')}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                Kembali Edit Teks
              </button>
              <button
                onClick={handleImport}
                disabled={importing || validCount === 0}
                className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:opacity-40 rounded-lg shadow-md shadow-green-500/20 transition-all"
              >
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Mengimpor...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Import {validCount} Soal
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
