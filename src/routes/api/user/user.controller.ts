import { Request, Response } from 'express';
import { encryptAndSend } from '../../../services/crypto/encryptionHelpers.js';
import { ERROR_CODE, ERROR_CATEGORY } from '../../../constants/error.codes.js';
import User from '../../../model/user.js';
import { createLogger } from '../../../middleware/logger.js';
import type { RenameInput, CommentSetInput, TitleSetInput, PartnerSetInput, SearchUserIdInput, SearchGameIdInput, SessionOnlyInput, NavigationRewardReceiveInput } from './user.schema.js';
import { vociNavigazione, conteggiNavigazione, riscattaNavigazioni } from '../../../services/navigazioneService.js';
import { KARIDAMA_PRINCIPALE } from '../../../services/karidamaService.js';
const log = createLogger('user');

const DEFAULT_SOCIAL_EQUIP = {
  social_arm: { equipment_id: 'NO_EQUIP', mst_equipment_id: 0 },
  social_body: { equipment_id: 'NO_EQUIP', mst_equipment_id: 0 },
  social_head: { equipment_id: 'NO_EQUIP', mst_equipment_id: 0 },
  social_leg: { equipment_id: 'NO_EQUIP', mst_equipment_id: 0 },
  social_waist: { equipment_id: 'NO_EQUIP', mst_equipment_id: 0 },
};

const buildUserInfoResponse = (
  doc: NonNullable<Awaited<ReturnType<typeof User.findOne>>>,
  overrides: { parameter?: object; selected_equip_set_index?: number; title?: { mst_title_id: number } } = {},
) => {
  const selectedOtomoTeam = doc.otomoteam?.otomo_team.find(
    (team) => team.index === doc.otomoteam?.selected_index,
  );
  return {
    capacity_eqp_set: doc.equipset?.capacity_eqp_set,
    caplink_id: 'caplnk',
    comment: doc.comment,
    equip_sets: doc.equipset?.equip_sets,
    game_id: doc.game_id,
    model_info: doc.model_info,
    name: doc.character_name,
    otomo_team: {
      main: doc.box?.otomos?.find(
        (otomo) => otomo.otomo_id === selectedOtomoTeam?.otomo_ids[0],
      ),
      sub: doc.box?.otomos?.find((otomo) => otomo.otomo_id === selectedOtomoTeam?.otomo_ids[1]),
    },
    parameter: overrides.parameter ?? {
      attack: doc.box?.monument?.mlv?.atk,
      defence: doc.box?.monument?.mlv?.def,
      hp: doc.box?.monument?.mlv?.hp,
      rank: doc.box?.monument?.hr,
      sp: doc.box?.monument?.mlv?.sp,
    },
    selected_equip_set_index: overrides.selected_equip_set_index ?? doc.equipset?.selected_equip_set_index,
    selected_partner: {
      main_partner_id: doc.selected_partner?.main_partner_id,
      quest_partner_id: doc.selected_partner?.quest_partner_id,
    },
    social_equip: DEFAULT_SOCIAL_EQUIP,
    title: overrides.title ?? { mst_title_id: 0 },
    use_social_equip: -1,
    user_id: doc.user_id,
  };
};

export const rename = async (req: Request, res: Response) => {
  try {
    const { name, session_id } = req.body as RenameInput;
    const filter = { current_session: session_id };
    const update = { character_name: name };
    const doc = await User.findOneAndUpdate(filter, update, {
      new: true,
    });

    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); //Not authenticated
    }

    // Set name in db
    // Send request back
    const data = {
      name: doc.character_name,
    };
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in rename:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Rename failed');
  }
};

export const get = async (req: Request, res: Response) => {
  try {
    const { session_id } = req.body as SessionOnlyInput;
    const filter = { current_session: session_id };

    const doc = await User.findOne(filter);
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); //Not authenticated
    }

    const data = {
      payment_model_info: { face: { man: [], woman: [] } },
      user_info: buildUserInfoResponse(doc),
    };

    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in user get:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Get user failed');
  }
};

export const commentSet = async (req: Request, res: Response) => {
  try {
    const { comment, session_id } = req.body as CommentSetInput;
    const filter = { current_session: session_id };
    const update = { comment: comment };
    const doc = await User.findOneAndUpdate(filter, update, {
      new: true,
    });

    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); // Not authenticated
    }

    const data = {
      comment: doc.comment,
    };

    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in commentSet:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Set comment failed');
  }
};

export const navigationNews = (req: Request, res: Response) => {
  try {
    const data: {
      navigations: {
        close_at: number;
        end_at: number;
        explain: string;
        is_clear: number;
        is_reward: number;
        item_list: Record<string, never>;
        limited_flag: number;
        mst_navigation_id: number;
        name: string;
        progress: number;
        progress_max: number;
        start_at: number;
      }[];
    } = {
      navigations: [],
    };
    if (false as boolean) {
      // TODO: enable when navigation is implemented
      data.navigations.push({
        close_at: 3600,
        end_at: 3600,
        explain: 'explain',
        is_clear: 0,
        is_reward: 0,
        item_list: {},
        limited_flag: 0,
        mst_navigation_id: 1,
        name: 'Achivement Name',
        progress: 0,
        progress_max: 99,
        start_at: 1,
      });
    }

    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in navigationNews:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Get navigation news failed');
  }
};

export const achievementNews = (req: Request, res: Response) => {
  try {
    const data = {
      achievements: [],
      apple_achievements: [],
      google_achievements: [],
    };

    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in achievementNews:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Get achievement news failed');
  }
};

export const achievementAll = (req: Request, res: Response) => {
  try {
    const data = {
      achievements: [
        // {is_clear:0,
        //   is_reward:0,
        //   mst_achievement_id:0,
        //   progress:0,
        //   progress_max:100
        // }
      ],
    };

    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in achievementAll:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Get all achievements failed');
  }
};

export const OfferCheck = (req: Request, res: Response) => {
  try {
    const data = {
      offer_products: [],
    };

    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in OfferCheck:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Offer check failed');
  }
};

export const navigationAll = async (req: Request, res: Response) => {
  try {
    // La bussola in home (探検ナビ): le voci vere, vedi services/navigazioneService.ts.
    const { session_id } = req.body as SessionOnlyInput;
    const doc = await User.findOne({ current_session: session_id });
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }
    encryptAndSend({ navigations: vociNavigazione(doc) }, res, req);
  } catch (error) {
    log.error('Error in navigationAll:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Get navigation failed');
  }
};

export const navigationRewardReceive = async (req: Request, res: Response) => {
  try {
    // Campi della risposta letti con Ghidra (cAPIUserNavigationRewardReceive::Response):
    // navigation_rewards[{ mst_navigation_id, additional_box }] + navigationNum.
    const { session_id, mst_navigation_ids } = req.body as NavigationRewardReceiveInput;
    const doc = await User.findOne({ current_session: session_id });
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED);
    }
    const premi = await riscattaNavigazioni(doc._id, mst_navigation_ids ?? []);
    for (const p of premi) log.info('探検ナビ | %s riscatta %d: +%d 狩玉', doc.character_name ?? '?', p.mst_navigation_id, p.karidama);
    const riscattate = [...(doc.navigazioni_riscattate ?? []), ...premi.map((p) => p.mst_navigation_id)];
    encryptAndSend({
      navigation_rewards: premi.map((p) => ({
        mst_navigation_id: p.mst_navigation_id,
        additional_box: { payments: [{ amount: p.karidama, mst_payment_id: KARIDAMA_PRINCIPALE }] },
      })),
      navigationNum: conteggiNavigazione({ navigazioni_riscattate: riscattate }),
    }, res, req);
  } catch (error) {
    log.error('Error in navigationRewardReceive:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Receive navigation reward failed');
  }
};

export const titleAll = (req: Request, res: Response) => {
  const data = {
    new_titles: [
      //Makes pop up on enter
      // {
      //   is_clear: 0,
      //   mst_title_id: 0,
      //   progress: 0,
      //   progress_max: 20
      // }
    ],
    server_time: Date.now(),
    titles: [
      {
        is_clear: 1,
        mst_title_id: 2,
        progress: 0,
        progress_max: 20,
      },
      {
        is_clear: 1,
        mst_title_id: 4,
        progress: 0,
        progress_max: 20,
      },
    ],
  };
  encryptAndSend(data, res, req);
};

export const titleNews = (req: Request, res: Response) => {
  const data = {
    server_time: Date.now(),
    titles: [
      // Uncomment for title pop up
      // {
      //   is_clear: 1,
      //   is_review: 0,
      //   mst_title_id: 4,
      //   progress: 1,
      //   progress_max: 99,
      // },
    ],
  };
  encryptAndSend(data, res, req);
};

export const titleSet = async (req: Request, res: Response) => {
  try {
    const { session_id, mst_title_id } = req.body as TitleSetInput;
    const filter = { current_session: session_id };

    const doc = await User.findOne(filter);
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); //Not authenticated
    }
    const data = {
      user_info: buildUserInfoResponse(doc, {
        parameter: { attack: 1, defence: 1, hp: 1, rank: 1, sp: 1 },
        selected_equip_set_index: 1,
        title: { mst_title_id },
      }),
    };
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in titleSet:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Set title failed');
  }
};

export const partnerGet = async (req: Request, res: Response) => {
  try {
    const { session_id, main_partner_id, quest_partner_id } = req.body as PartnerSetInput;
    const filter = { current_session: session_id };

    let doc = await User.findOne(filter);
    if (!doc) {
      return encryptAndSend({}, res, req, ERROR_CODE.NOT_AUTHENTICATED); // Not authenticated
    }
    doc.selected_partner!.main_partner_id = String(main_partner_id);
    doc.selected_partner!.quest_partner_id = String(quest_partner_id);

    const update = { selected_partner: doc.selected_partner };
    doc = await User.findOneAndUpdate(filter, update, {
      new: true,
    });

    const data = {
      selected_partner: {
        main_partner_id: doc?.selected_partner?.main_partner_id,
        quest_partner_id: doc?.selected_partner?.quest_partner_id,
      },
    };

    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in partnerGet:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Get partner failed');
  }
};
type UserDoc = NonNullable<Awaited<ReturnType<typeof User.findOne>>>;

const EQUIP_SLOTS = ['arm', 'body', 'head', 'leg', 'secret_weapon', 'waist', 'weapon'] as const;

/*
 * Il pezzo equipaggiato in uno slot del set SELEZIONATO. Il set (EquipSet)
 * tiene solo il riferimento equipment_id; le statistiche vere (hash/livello/
 * potenziale/skill) stanno nel pezzo posseduto dentro box.equipments, quindi
 * vanno cercate li'. Slot vuoto o pezzo non trovato = tutto a zero (stesso
 * significato di NO_EQUIP altrove nel progetto), mai un hash inventato.
 */
const buildEquipInfo = (doc: UserDoc, slot: (typeof EQUIP_SLOTS)[number]) => {
  const selectedSet = doc.equipset?.equip_sets?.find(
    (s) => s.index === doc.equipset?.selected_equip_set_index,
  );
  const equipmentId = selectedSet?.[slot]?.equipment_id;
  const owned = equipmentId ? doc.box?.equipments?.find((e) => e.equipment_id === equipmentId) : undefined;
  return {
    equip_info: {
      hash: owned?.mst_equipment_id ?? 0,
      level: owned?.elv ?? 0,
      potential: owned?.potential ?? 0,
      skill_level: owned?.slv ?? 0,
    },
  };
};

/*
 * Scheda di un giocatore trovato dalla ricerca. "friend_at" e "is_friend"
 * sono relativi a chi cerca (viewer): se non si riesce a risalire a chi sta
 * cercando (session_id assente/non valido), si risponde comunque con "non
 * amici" invece di far fallire tutta la ricerca — non e' un dato critico
 * quanto un hash sbagliato.
 */
const buildPlayerDetail = (doc: UserDoc, viewer: UserDoc | null) => {
  const friendEntry = viewer?.friend_info?.list?.find((f) => f.uid === doc.user_id);
  const equip = Object.fromEntries(
    EQUIP_SLOTS.map((slot) => [`equip_${slot}`, buildEquipInfo(doc, slot)]),
  ) as Record<`equip_${(typeof EQUIP_SLOTS)[number]}`, ReturnType<typeof buildEquipInfo>>;

  return {
    comment: doc.comment ?? '',
    created: 0,
    ...equip,
    is_awake: 0,
    is_enable: 1,
    friend_at: friendEntry?.created ?? 0,
    game_id: doc.game_id ?? '',
    guild_info: {
      gid: doc.guild_info?.gid ?? '',
      is_guild: doc.guild_info?.is_guild ?? 0,
      is_same: viewer?.guild_info?.gid && viewer.guild_info.gid === doc.guild_info?.gid ? 1 : 0,
      member_type: doc.guild_info?.member_type ?? 0,
      name: doc.guild_info?.name ?? '',
      rank: doc.guild_info?.rank ?? 0,
    },
    is_captomo: 0,
    is_friend: friendEntry ? 1 : 0,
    last_access_at: 0,
    login_freq: 0,
  };
};

export const searchId = async (req: Request, res: Response) => {
  try {
    const { uids, session_id } = req.body as SearchUserIdInput & { session_id?: unknown };
    const viewer = typeof session_id === 'string' ? await User.findOne({ current_session: session_id }) : null;

    const ids = (uids ?? []).filter((u): u is string => typeof u === 'string');
    const found = ids.length ? await User.find({ user_id: { $in: ids } }) : [];

    const data = {
      capacity_eqp_set: viewer?.equipset?.capacity_eqp_set ?? 1,
      player_details: found.map((doc) => buildPlayerDetail(doc, viewer)),
    };
    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in searchId:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Search by ID failed');
  }
};

export const gameId = async (req: Request, res: Response) => {
  try {
    const { gameIds, session_id } = req.body as SearchGameIdInput & { session_id?: unknown };
    const viewer = typeof session_id === 'string' ? await User.findOne({ current_session: session_id }) : null;

    const ids = (gameIds ?? []).filter((g): g is string => typeof g === 'string');
    const found = ids.length ? await User.find({ game_id: { $in: ids } }) : [];

    const data = {
      capacity_eqp_set: viewer?.equipset?.capacity_eqp_set ?? 1,
      // Stessa scheda di searchId, con in piu' i campi "player_*" che il
      // client usa solo per la scheda di ricerca-per-codice (searchId non li
      // ha mai avuti nella cattura originale). Le stat non tracciate da
      // questo server (rank_point/s_flag/search_rank/skin_*/total_score) restano
      // a zero: e' un "non calcolato ancora", non un valore inventato.
      player_details: found.map((doc) => ({
        ...buildPlayerDetail(doc, viewer),
        player_id: doc.game_id ?? '',
        player_name: doc.character_name ?? '',
        player_rank: doc.box?.monument?.hr ?? 0,
        player_rank_point: 0,
        player_s_flag: 0,
        player_search_rank: 0,
        player_skin_hash: 0,
        player_skin_level: 0,
        player_skin_potential: 0,
        player_skin_skill_level: 0,
        player_total_score: 0,
      })),
    };

    encryptAndSend(data, res, req);
  } catch (error) {
    log.error('Error in gameId:', error);
    encryptAndSend({}, res, req, ERROR_CODE.GENERIC_ERROR, ERROR_CATEGORY.ERROR_DIALOG, 'Search by game ID failed');
  }
};
