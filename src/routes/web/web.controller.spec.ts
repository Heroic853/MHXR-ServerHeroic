import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

vi.mock('node:fs/promises');

import { readFile } from 'node:fs/promises';
import {
  getWebContent,
  getNoticeIndexOld,
  getNoticeIndex,
  getScheduleIndex,
  getScheduleIndexOld,
  getFirstDL,
} from './web.controller.js';

function mockReqRes() {
  const req = { ip: '127.0.0.1', get: vi.fn() } as unknown as Request;
  const res = {
    sendFile: vi.fn(),
    redirect: vi.fn(),
    type: vi.fn().mockReturnThis(),
    send: vi.fn(),
  } as unknown as Response;
  return { req, res };
}

// Nessuna SITE_URL/SITE_GUIDE_URL impostata nell'ambiente di test: i
// controller ricadono sui loro default (mhxr-feedback/mhxr-guide su
// Heroic853SiteV1), sono questi i valori veri da aspettarsi qui.
const SITO_DEFAULT = 'https://heroic853.github.io/Heroic853SiteV1/mhxr-feedback';
const SITO_GUIDA_DEFAULT = 'https://heroic853.github.io/Heroic853SiteV1/mhxr-guide';

describe('web.controller', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getWebContent', () => {
    it('reads web-content.html and replaces {{SITO}} with the guide URL', async () => {
      vi.mocked(readFile).mockResolvedValue('<a href="{{SITO}}">guida</a>');
      const { req, res } = mockReqRes();
      getWebContent(req, res);
      await vi.waitFor(() => expect(res.send).toHaveBeenCalled());

      expect(readFile).toHaveBeenCalledWith(expect.stringContaining('web-content.html'), 'utf-8');
      expect(res.type).toHaveBeenCalledWith('html');
      expect(res.send).toHaveBeenCalledWith(`<a href="${SITO_GUIDA_DEFAULT}">guida</a>`);
    });

    it('falls back to redirecting to the guide URL if the file cannot be read', async () => {
      vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'));
      const { req, res } = mockReqRes();
      getWebContent(req, res);
      await vi.waitFor(() => expect(res.redirect).toHaveBeenCalled());

      expect(res.redirect).toHaveBeenCalledWith(SITO_GUIDA_DEFAULT);
    });
  });

  describe('getNoticeIndexOld', () => {
    it('sends notice-index-old.html file', () => {
      const { req, res } = mockReqRes();
      getNoticeIndexOld(req, res);

      expect(res.sendFile).toHaveBeenCalledWith(
        expect.stringContaining('notice-index-old.html'),
      );
    });
  });

  describe('getNoticeIndex', () => {
    it('redirects to the feedback site (no fragment, that was a single-page-app leftover)', () => {
      const { req, res } = mockReqRes();
      getNoticeIndex(req, res);

      expect(res.redirect).toHaveBeenCalledWith(SITO_DEFAULT);
    });
  });

  describe('getScheduleIndex', () => {
    it('redirects to the feedback site (no fragment, that was a single-page-app leftover)', () => {
      const { req, res } = mockReqRes();
      getScheduleIndex(req, res);

      expect(res.redirect).toHaveBeenCalledWith(SITO_DEFAULT);
    });
  });

  describe('getScheduleIndexOld', () => {
    it('sends schedule-index-old.html file', () => {
      const { req, res } = mockReqRes();
      getScheduleIndexOld(req, res);

      expect(res.sendFile).toHaveBeenCalledWith(
        expect.stringContaining('schedule-index-old.html'),
      );
    });
  });

  describe('getFirstDL', () => {
    it('sends first-dl.html file', () => {
      const { req, res } = mockReqRes();
      getFirstDL(req, res);

      expect(res.sendFile).toHaveBeenCalledWith(
        expect.stringContaining('first-dl.html'),
      );
    });
  });
});
