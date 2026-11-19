import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  TextRun,
} from 'docx';
import { saveAs } from 'file-saver';

export interface ExamDocxMeta {
  title: string;
  subject: string;
  className?: string;
  teacherName?: string;
  startTime?: string;
  endTime?: string;
  duration?: number;
}

export interface ExamDocxOption {
  text: string;
  is_correct: boolean;
  image?: string | null;
}

export interface ExamDocxQuestion {
  passage?: string | null;
  question_text: string;
  question_type: 'multiple_choice' | 'multiple_answer' | 'essay';
  points?: number;
  order: number;
  options?: ExamDocxOption[];
  image?: string | null;
  essay_keywords?: string[] | null;
}

export interface ExamDocxOptions {
  includeAnswerKey?: boolean;
  includeIdentity?: boolean;
}

const FONT = 'Times New Roman';
const BODY_SIZE = 22;
const MAX_IMAGE_WIDTH = 420;
const MAX_IMAGE_HEIGHT = 300;

type SupportedImageType = 'png' | 'jpg' | 'gif' | 'bmp';

interface LoadedImage {
  data: Uint8Array;
  type: SupportedImageType;
  width: number;
  height: number;
}

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value?: string): string {
  const date = parseDate(value);
  if (!date) return '';
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatTime(value?: string): string {
  const date = parseDate(value);
  if (!date) return '';
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

// Gambar soal disajikan lewat /storage sehingga diambil dari origin yang sama
// (rewrite Next) dan tidak terkena aturan CORS backend.
function toStorageUrl(url: string): string {
  const match = url.match(/\/storage\/([^?#]+)/);
  const relative = match ? match[1] : url.replace(/^\/?storage\//, '').split(/[?#]/)[0];
  return `/storage/${relative}`;
}

function fileNameOf(url: string): string {
  const clean = url.split(/[?#]/)[0];
  return clean.substring(clean.lastIndexOf('/') + 1) || 'gambar';
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function detectType(mime: string): SupportedImageType | null {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/bmp') return 'bmp';
  return null;
}

async function loadImage(url: string): Promise<LoadedImage | null> {
  const objectUrl = { value: '' };
  try {
    const response = await fetch(toStorageUrl(url));
    if (!response.ok) return null;
    const blob = await response.blob();

    objectUrl.value = URL.createObjectURL(blob);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = document.createElement('img');
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Gambar tidak dapat dibaca'));
      element.src = objectUrl.value;
    });

    const scale = Math.min(
      1,
      MAX_IMAGE_WIDTH / image.naturalWidth,
      MAX_IMAGE_HEIGHT / image.naturalHeight
    );
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const type = detectType(blob.type);
    if (type) {
      return { data: new Uint8Array(await blob.arrayBuffer()), type, width, height };
    }

    // Format lain (mis. webp) dikonversi ke PNG agar Word dapat merendernya.
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(image, 0, 0);
    const base64 = canvas.toDataURL('image/png').split(',')[1];
    return { data: base64ToBytes(base64), type: 'png', width, height };
  } catch {
    return null;
  } finally {
    if (objectUrl.value) URL.revokeObjectURL(objectUrl.value);
  }
}

async function imageParagraph(url: string, indent: number): Promise<Paragraph> {
  const image = await loadImage(url);
  if (!image) {
    return new Paragraph({
      spacing: { before: 60, after: 60 },
      indent: { left: indent },
      children: [
        new TextRun({
          text: `[Gambar: ${fileNameOf(url)}]`,
          italics: true,
          size: 20,
          color: '666666',
        }),
      ],
    });
  }

  return new Paragraph({
    spacing: { before: 60, after: 60 },
    indent: { left: indent },
    children: [
      new ImageRun({
        type: image.type,
        data: image.data,
        transformation: { width: image.width, height: image.height },
      }),
    ],
  });
}

function answerOf(question: ExamDocxQuestion): string {
  if (question.question_type === 'essay') {
    const keywords = (question.essay_keywords ?? []).filter(Boolean);
    return keywords.length ? keywords.join(', ') : '—';
  }
  const letters = (question.options ?? [])
    .map((option, index) => (option.is_correct ? String.fromCharCode(65 + index) : ''))
    .filter(Boolean);
  return letters.length ? letters.join(', ') : '—';
}

function buildFileName(exam: ExamDocxMeta): string {
  const raw = `Soal ${exam.subject} - ${exam.title}`;
  const safe = raw
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return `${safe || 'Soal Ujian'}.docx`;
}

export async function exportExamToDocx(
  exam: ExamDocxMeta,
  questions: ExamDocxQuestion[],
  options: ExamDocxOptions = {}
): Promise<void> {
  const includeAnswerKey = options.includeAnswerKey ?? false;
  const includeIdentity = options.includeIdentity ?? true;
  const ordered = [...questions].sort((a, b) => a.order - b.order);
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [new TextRun({ text: exam.title, bold: true, size: 28 })],
    })
  );

  const subjectLine = [exam.subject, exam.className ? `Kelas ${exam.className}` : '']
    .filter(Boolean)
    .join(' · ');
  if (subjectLine) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [new TextRun({ text: subjectLine, size: BODY_SIZE })],
      })
    );
  }

  const metaParts: string[] = [];
  const dateLabel = formatDate(exam.startTime);
  if (dateLabel) metaParts.push(dateLabel);
  const startLabel = formatTime(exam.startTime);
  const endLabel = formatTime(exam.endTime);
  if (startLabel) metaParts.push(endLabel ? `${startLabel}–${endLabel}` : startLabel);
  if (exam.duration) metaParts.push(`${exam.duration} menit`);
  if (exam.teacherName) metaParts.push(`Guru: ${exam.teacherName}`);
  if (metaParts.length) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: metaParts.join(' · '), size: 20 })],
      })
    );
  }

  if (includeIdentity) {
    children.push(
      new Paragraph({
        spacing: { before: 80, after: 200 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 6, space: 6, color: '000000' },
        },
        children: [
          new TextRun({
            text:
              'Nama: ..................................................    ' +
              'Kelas: ....................    No. Absen: ....................',
            size: BODY_SIZE,
          }),
        ],
      })
    );
  }

  for (let index = 0; index < ordered.length; index += 1) {
    const question = ordered[index];
    const number = index + 1;

    if (question.passage?.trim()) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          spacing: { before: 120, after: 80 },
          indent: { left: 240, right: 240 },
          children: [new TextRun({ text: question.passage, italics: true, size: BODY_SIZE })],
        })
      );
    }

    children.push(
      new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        spacing: { before: 120, after: 80 },
        indent: { left: 340, hanging: 340 },
        children: [
          new TextRun({ text: `${number}. `, bold: true, size: BODY_SIZE }),
          new TextRun({ text: question.question_text, size: BODY_SIZE }),
        ],
      })
    );

    if (question.image) {
      children.push(await imageParagraph(question.image, 340));
    }

    const questionOptions = question.options ?? [];
    const isChoice =
      question.question_type === 'multiple_choice' || question.question_type === 'multiple_answer';

    if (isChoice) {
      for (let optionIndex = 0; optionIndex < questionOptions.length; optionIndex += 1) {
        const option = questionOptions[optionIndex];
        const label = String.fromCharCode(65 + optionIndex);
        children.push(
          new Paragraph({
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 40 },
            indent: { left: 680, hanging: 220 },
            children: [
              new TextRun({ text: `${label}. `, size: BODY_SIZE }),
              new TextRun({ text: option.text, size: BODY_SIZE }),
            ],
          })
        );
        if (option.image) {
          children.push(await imageParagraph(option.image, 680));
        }
      }
    } else {
      children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));
    }
  }

  if (includeAnswerKey) {
    children.push(new Paragraph({ children: [new PageBreak()] }));
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: 'KUNCI JAWABAN', bold: true, size: 24 })],
      })
    );
    ordered.forEach((question, index) => {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          indent: { left: 340, hanging: 340 },
          children: [
            new TextRun({ text: `${index + 1}. `, bold: true, size: BODY_SIZE }),
            new TextRun({ text: answerOf(question), size: BODY_SIZE }),
          ],
        })
      );
    });
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: FONT, size: BODY_SIZE } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: { top: 1134, right: 1134, bottom: 1134, left: 1418 },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, buildFileName(exam));
}
