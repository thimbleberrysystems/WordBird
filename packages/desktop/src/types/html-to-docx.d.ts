/**
 * html-to-docx ships no types. Minimal surface used by BookExporter.
 */
declare module 'html-to-docx' {
  interface HtmlToDocxOptions {
    title?: string
    creator?: string
    orientation?: 'portrait' | 'landscape'
  }

  export default function htmlToDocx(
    htmlString: string,
    headerHtmlString?: string,
    options?: HtmlToDocxOptions,
    footerHtmlString?: string
  ): Promise<Buffer | Blob | ArrayBuffer>
}
