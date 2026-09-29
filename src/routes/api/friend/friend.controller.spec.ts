import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';

vi.mock('../../../services/crypto/encryptionHelpers');
vi.mock('../../../model/user');

import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import User from '../../../model/user.js';
import { ERROR_CODE } from '../../../constants/error.codes.js';
import { capacityInfo, listFriends, listRequests, sendRequest, acceptRequest } from './friend.controller.js';

function mockReqRes(body: Record<string, unknown> = {}) {
  const req = { body, ip: '127.0.0.1', get: vi.fn() } as unknown as Request;
  const res = {} as Response;
  return { req, res };
}

const baseUser = (overrides: Record<string, unknown> = {}) => ({
  _id: 'mongo-id',
  user_id: 'u1',
  game_id: 'GID1',
  character_name: 'Hunter',
  comment: '',
  box: { capacity: { friend_max: 100 }, equipments: [], monument: { hr: 0 } },
  equipset: { capacity_eqp_set: 1, equip_sets: [], selected_equip_set_index: 0 },
  guild_info: {},
  friend_info: { list: [], receive: [], send: [] },
  ...overrides,
});

describe('friend.controller', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('capacityInfo', () => {
    it('returns real max/now from the user doc', async () => {
      vi.mocked(User.findOne).mockResolvedValue(
        baseUser({ friend_info: { list: [{ uid: 'u2', created: 1 }], receive: [], send: [] } }) as never,
      );
      const { req, res } = mockReqRes({ session_id: 's1' });
      await capacityInfo(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith({ max: 100, now: 1, price: 0 }, res, req);
    });

    it('returns NOT_AUTHENTICATED when the session is unknown', async () => {
      vi.mocked(User.findOne).mockResolvedValue(null);
      const { req, res } = mockReqRes({ session_id: 'bad' });
      await capacityInfo(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    });
  });

  describe('listFriends', () => {
    it('resolves each friend uid to a real user summary', async () => {
      vi.mocked(User.findOne).mockResolvedValue(
        baseUser({ friend_info: { list: [{ uid: 'u2', created: 123 }], receive: [], send: [] } }) as never,
      );
      vi.mocked(User.find).mockResolvedValue([
        baseUser({ user_id: 'u2', game_id: 'GID2', character_name: 'Friendo' }),
      ] as never);
      const { req, res } = mockReqRes({ session_id: 's1' });
      await listFriends(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith(
        { friends: [{ game_id: 'GID2', name: 'Friendo', rank: 0, last_access_at: 0, created: 123 }] },
        res,
        req,
      );
    });
  });

  describe('sendRequest', () => {
    it('rejects a request to yourself', async () => {
      const self = baseUser();
      vi.mocked(User.findOne)
        .mockResolvedValueOnce(self as never) // self
        .mockResolvedValueOnce(self as never); // target === self
      const { req, res } = mockReqRes({ session_id: 's1', target_game_id: 'GID1' });
      await sendRequest(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith(
        {},
        res,
        req,
        ERROR_CODE.FRIEND_CANNOT_REQUEST_SELF,
        expect.anything(),
        expect.any(String),
      );
    });

    it('rejects if already friends', async () => {
      const self = baseUser({ friend_info: { list: [{ uid: 'u2', created: 1 }], receive: [], send: [] } });
      const target = baseUser({ user_id: 'u2', game_id: 'GID2' });
      vi.mocked(User.findOne).mockResolvedValueOnce(self as never).mockResolvedValueOnce(target as never);
      const { req, res } = mockReqRes({ session_id: 's1', target_game_id: 'GID2' });
      await sendRequest(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith(
        {},
        res,
        req,
        ERROR_CODE.FRIEND_ALREADY_FRIENDS,
        expect.anything(),
        expect.any(String),
      );
    });

    it('rejects if the target inbox is full', async () => {
      const self = baseUser();
      const fullReceive = Array.from({ length: 100 }, (_, i) => ({ _id: String(i), created: 0, uid: `x${i}` }));
      const target = baseUser({
        user_id: 'u2',
        game_id: 'GID2',
        friend_info: { list: [], receive: fullReceive, send: [] },
      });
      vi.mocked(User.findOne).mockResolvedValueOnce(self as never).mockResolvedValueOnce(target as never);
      const { req, res } = mockReqRes({ session_id: 's1', target_game_id: 'GID2' });
      await sendRequest(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith(
        {},
        res,
        req,
        ERROR_CODE.FRIEND_TARGET_INBOX_FULL,
        expect.anything(),
        expect.any(String),
      );
    });

    it('sends a request and writes both sides', async () => {
      const self = baseUser();
      const target = baseUser({ user_id: 'u2', game_id: 'GID2' });
      vi.mocked(User.findOne).mockResolvedValueOnce(self as never).mockResolvedValueOnce(target as never);
      vi.mocked(User.updateOne).mockResolvedValue({} as never);
      const { req, res } = mockReqRes({ session_id: 's1', target_game_id: 'GID2' });
      await sendRequest(req, res);
      expect(User.updateOne).toHaveBeenCalledTimes(2);
      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req);
    });
  });

  describe('acceptRequest', () => {
    it('rejects if the request no longer exists', async () => {
      const self = baseUser();
      const requester = baseUser({ user_id: 'u2', game_id: 'GID2' });
      vi.mocked(User.findOne).mockResolvedValueOnce(self as never).mockResolvedValueOnce(requester as never);
      const { req, res } = mockReqRes({ session_id: 's1', target_game_id: 'GID2' });
      await acceptRequest(req, res);
      expect(encryptAndSend).toHaveBeenCalledWith(
        {},
        res,
        req,
        ERROR_CODE.FRIEND_REQUEST_GONE,
        expect.anything(),
        expect.any(String),
      );
    });

    it('accepts and writes both sides when the request exists and slots are free', async () => {
      const self = baseUser({ friend_info: { list: [], receive: [{ _id: 'r1', created: 1, uid: 'u2' }], send: [] } });
      const requester = baseUser({ user_id: 'u2', game_id: 'GID2' });
      vi.mocked(User.findOne).mockResolvedValueOnce(self as never).mockResolvedValueOnce(requester as never);
      vi.mocked(User.updateOne).mockResolvedValue({} as never);
      const { req, res } = mockReqRes({ session_id: 's1', target_game_id: 'GID2' });
      await acceptRequest(req, res);
      expect(User.updateOne).toHaveBeenCalledTimes(2);
      expect(encryptAndSend).toHaveBeenCalledWith({}, res, req);
    });
  });
});
