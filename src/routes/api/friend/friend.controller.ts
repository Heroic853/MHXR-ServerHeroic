import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import { ERROR_CODE, ERROR_CATEGORY } from '../../../constants/error.codes.js';
import { createLogger } from '../../../middleware/logger.js';
import User from '../../../model/user.js';
import type { SendRequestInput, AcceptRequestInput } from './friend.schema.js';
import type { SessionOnlyInput } from '../../../schemas/common.schema.js';

const log = createLogger('friend');

/*
 * "狩友" (Hunting Friend): relazione 1 a 1 fra due account, con richiesta di
 * mezzo (send/receive), esattamente come il casato ma senza gruppo. Le regole
 * sotto (chi puo' mandare/accettare, quando si rifiuta) sono quelle vere del
 * gioco: vengono dai messaggi di errore EAPI_jpn indici 59-68 (tradotti in
 * lavoro-traduzione/trad/EAPI.json), non inventate.
 *
 * Il capacity_eqp_set/friend_max vive su box.capacity.friend_max (gia'
 * presente nello schema utente, default 100): e' lo stesso numero che
 * capacityInfo mostra come "max".
 */

export const capacityInfo = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body as SessionOnlyInput;
    const doc = await User.findOne({ current_session: session_id });
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }
    const data = {
      max: doc.box?.capacity?.friend_max ?? 100,
      now: doc.friend_info?.list?.length ?? 0,
      price: 0,
    };
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in capacityInfo:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Capacity info failed');
  }
};

/** Riassunto minimo di un giocatore per le liste amici/richieste. */
const friendSummary = (doc: NonNullable<Awaited<ReturnType<typeof User.findOne>>>) => ({
  game_id: doc.game_id,
  name: doc.character_name,
  rank: doc.box?.monument?.hr ?? 0,
  last_access_at: 0,
});

export const listFriends = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body as SessionOnlyInput;
    const doc = await User.findOne({ current_session: session_id });
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }
    const entries = doc.friend_info?.list ?? [];
    const others = await User.find({ user_id: { $in: entries.map((e) => e.uid) } });
    const byUid = new Map(others.map((o) => [o.user_id, o]));
    const friends = entries
      .map((e) => {
        const other = byUid.get(e.uid);
        return other ? { ...friendSummary(other), created: e.created } : null;
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);
    encryptAndSend({ friends }, res, req);
  } catch (error) {
    log.error('Error in listFriends:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'List friends failed');
  }
};

export const listRequests = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body as SessionOnlyInput;
    const doc = await User.findOne({ current_session: session_id });
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }
    const received = doc.friend_info?.receive ?? [];
    const others = await User.find({ user_id: { $in: received.map((e) => e.uid) } });
    const byUid = new Map(others.map((o) => [o.user_id, o]));
    const requests = received
      .map((e) => {
        const other = byUid.get(e.uid);
        return other ? { ...friendSummary(other), created: e.created } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    encryptAndSend({ requests }, res, req);
  } catch (error) {
    log.error('Error in listRequests:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'List requests failed');
  }
};

export const sendRequest = async (req: Request, res: Response) => {
  try {
    const { session_id, target_game_id } = req.body as SendRequestInput;
    const self = await User.findOne({ current_session: session_id });
    if (!self) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }
    const target = await User.findOne({ game_id: target_game_id });
    if (!target) {
      return encryptAndSend({}, res, req, ERROR_CODE.FRIEND_NOT_FOUND, ERROR_CATEGORY.ERROR_DIALOG, 'Hunting Friend not found');
    }
    if (target.user_id === self.user_id) {
      return encryptAndSend({}, res, req, ERROR_CODE.FRIEND_CANNOT_REQUEST_SELF, ERROR_CATEGORY.ERROR_DIALOG, 'Cannot send a Hunting Friend request to yourself');
    }
    const selfList = self.friend_info?.list ?? [];
    if (selfList.some((f) => f.uid === target.user_id)) {
      return encryptAndSend({}, res, req, ERROR_CODE.FRIEND_ALREADY_FRIENDS, ERROR_CATEGORY.ERROR_DIALOG, 'Already Hunting Friends');
    }
    const selfSend = self.friend_info?.send ?? [];
    if (selfSend.some((r) => r.uid === target.user_id)) {
      return encryptAndSend({}, res, req, ERROR_CODE.FRIEND_REQUEST_ALREADY_SENT, ERROR_CATEGORY.ERROR_DIALOG, 'Already sent a Hunting Friend request to that hunter');
    }
    const targetReceive = target.friend_info?.receive ?? [];
    const targetMax = target.box?.capacity?.friend_max ?? 100;
    if (targetReceive.length >= targetMax) {
      return encryptAndSend({}, res, req, ERROR_CODE.FRIEND_TARGET_INBOX_FULL, ERROR_CATEGORY.ERROR_DIALOG, "That hunter's Hunting Friend requests are full");
    }

    const now = Date.now();
    const requestId = new mongoose.Types.ObjectId().toString();

    await User.updateOne(
      { _id: self._id },
      { $push: { 'friend_info.send': { _id: requestId, created: now, uid: target.user_id } } },
    );
    await User.updateOne(
      { _id: target._id },
      { $push: { 'friend_info.receive': { _id: requestId, created: now, uid: self.user_id } } },
    );

    encryptAndSend({}, res, req);
  } catch (error) {
    log.error('Error in sendRequest:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Send request failed');
  }
};

export const acceptRequest = async (req: Request, res: Response) => {
  try {
    const { session_id, target_game_id } = req.body as AcceptRequestInput;
    const self = await User.findOne({ current_session: session_id });
    if (!self) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }
    const requester = await User.findOne({ game_id: target_game_id });
    if (!requester) {
      return encryptAndSend({}, res, req, ERROR_CODE.FRIEND_NOT_FOUND, ERROR_CATEGORY.ERROR_DIALOG, 'Hunting Friend not found');
    }

    const pending = (self.friend_info?.receive ?? []).find((r) => r.uid === requester.user_id);
    if (!pending) {
      return encryptAndSend({}, res, req, ERROR_CODE.FRIEND_REQUEST_GONE, ERROR_CATEGORY.ERROR_DIALOG, 'The Hunting Friend request no longer exists');
    }

    const selfMax = self.box?.capacity?.friend_max ?? 100;
    if ((self.friend_info?.list?.length ?? 0) >= selfMax) {
      return encryptAndSend({}, res, req, ERROR_CODE.FRIEND_OWN_SLOTS_FULL, ERROR_CATEGORY.ERROR_DIALOG, 'Your Hunting Friend slots are full');
    }
    const requesterMax = requester.box?.capacity?.friend_max ?? 100;
    if ((requester.friend_info?.list?.length ?? 0) >= requesterMax) {
      return encryptAndSend({}, res, req, ERROR_CODE.FRIEND_TARGET_SLOTS_FULL, ERROR_CATEGORY.ERROR_DIALOG, "The other hunter's Hunting Friend slots are full");
    }

    const now = Date.now();
    await User.updateOne(
      { _id: self._id },
      {
        $pull: { 'friend_info.receive': { uid: requester.user_id } },
        $push: { 'friend_info.list': { uid: requester.user_id, created: now } },
      },
    );
    await User.updateOne(
      { _id: requester._id },
      {
        $pull: { 'friend_info.send': { uid: self.user_id } },
        $push: { 'friend_info.list': { uid: self.user_id, created: now } },
      },
    );

    encryptAndSend({}, res, req);
  } catch (error) {
    log.error('Error in acceptRequest:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Accept request failed');
  }
};
