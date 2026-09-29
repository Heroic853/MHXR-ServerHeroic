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

// Nessuna SITE_URL impostata nell'ambiente di test: i controller ricadono sul
// default (mhxr-feedback su Heroic853SiteV1), e' questo il valore da aspettarsi.
const SITO_DEFAULT = 'https://heroic853.github.io/Heroic853SiteV1/mhxr-feedback';

describe('web.controller', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getWebContent', () => {
    it('redirects straight to the feedback site, without our old HTML card', () => {
      const { req, res } = mockReqRes();
      getWebContent(req, res);

      expect(res.redirect).toHaveBeenCalledWith(SITO_DEFAULT);
      expect(readFile).not.toHaveBeenCalled();
      expect(res.send).not.toHaveBeenCalled();
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
