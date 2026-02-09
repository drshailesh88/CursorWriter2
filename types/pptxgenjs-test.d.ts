declare module 'pptxgenjs' {
  import type { Mock } from 'vitest';

  const PptxGenJS: new (...args: unknown[]) => {
    title: string;
    author: string;
    subject: string;
    company: string;
    layout: string;
    defineSlideMaster: (...args: unknown[]) => unknown;
    addSlide: (...args: unknown[]) => unknown;
    write: (...args: unknown[]) => Promise<Blob>;
  };
  export default PptxGenJS;

  export const mockPptxSlide: {
    addText: Mock;
    addImage: Mock;
    addTable: Mock;
    addChart: Mock;
    addNotes: Mock;
    background: unknown;
  };

  export const mockPptxInstance: {
    title: string;
    author: string;
    subject: string;
    company: string;
    layout: string;
    defineSlideMaster: Mock;
    addSlide: Mock;
    write: Mock;
  };
}
