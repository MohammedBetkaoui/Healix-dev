import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { type Browser, chromium } from 'playwright';

import { type ReportDocument } from './ai-report-template';

// A4 portrait. 18 mm of white paper on every side: the header and footer sit
// inside the top and bottom margins, the content starts below them.
export const REPORT_PAGE_MARGINS = {
  bottom: '28mm',
  left: '18mm',
  right: '18mm',
  top: '44mm',
} as const;

// HTML to PDF through a headless Chromium (Playwright), launched on the first
// report, reused afterwards, closed with the module. The page has no network:
// fonts and images are inlined by the template.
@Injectable()
export class AiReportRenderer implements OnModuleDestroy {
  private readonly logger = new Logger(AiReportRenderer.name);
  private browser: Promise<Browser> | null = null;

  async render(
    report: Pick<ReportDocument, 'html' | 'headerTemplate' | 'footerTemplate'>,
  ): Promise<Buffer> {
    const browser = await this.getBrowser();
    const context = await browser.newContext();
    try {
      // Nothing may be loaded from outside the document.
      await context.route('**/*', (route) => route.abort());
      const page = await context.newPage();
      await page.setContent(report.html, { waitUntil: 'load' });
      // Evaluated in the page (no DOM types here): the embedded fonts are ready.
      await page.evaluate('document.fonts.ready.then(() => true)');
      return await page.pdf({
        displayHeaderFooter: true,
        footerTemplate: report.footerTemplate,
        format: 'A4',
        headerTemplate: report.headerTemplate,
        margin: REPORT_PAGE_MARGINS,
        printBackground: true,
      });
    } finally {
      await context.close().catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    if (browser) {
      await browser.then((instance) => instance.close()).catch(() => undefined);
    }
  }

  private getBrowser(): Promise<Browser> {
    if (!this.browser) {
      const launching = chromium.launch({ headless: true });
      this.browser = launching;
      launching.then(
        (instance) =>
          // A crashed Chromium is launched again on the next report.
          instance.on('disconnected', () => {
            if (this.browser === launching) this.browser = null;
          }),
        (error: unknown) => {
          if (this.browser === launching) this.browser = null;
          this.logger.error(
            'Chromium could not be launched (npx playwright install chromium).',
            error instanceof Error ? error.message : 'Unknown error',
          );
        },
      );
    }
    return this.browser;
  }
}
