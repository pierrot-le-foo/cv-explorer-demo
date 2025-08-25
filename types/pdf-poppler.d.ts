declare module 'pdf-poppler' {
  interface ConvertOptions {
    format?: 'jpeg' | 'png' | 'tiff' | 'ps' | 'eps' | 'svg';
    out_dir?: string;
    out_prefix?: string;
    page?: number;
    scale?: number;
    single_file?: boolean;
  }

  export function convert(pdfPath: string, options: ConvertOptions): Promise<string[]>;
}
