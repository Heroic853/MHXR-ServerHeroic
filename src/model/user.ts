import mongoose, { Document } from 'mongoose';
import OceanSchema from './ocean.js';
import equipmentSchema from './items/equipment.js';
import growthItemSchema from './items/growth_item.js';
import limitedSchema from './items/limited.js';
import matatabiSchema from './items/matatabi.js';
import materialSchema from './items/material.js';
import paymentSchema from './items/payment.js';
import pointSchema from './items/point.js';
import powerSchema from './items/power.js';
import augiteSchema from './items/augite.js';
import otomoSchema from './sidekicks/otomo.js';
import partnerSchema from './sidekicks/partner.js';
import otomoTeamSchema from './sidekicks/otomoTeam.js';
import type {
  Box,
  Ocean,
  ClearedQuest,
  EquipSet,
  SocialEquipset,
  OtomoTeam,
  ModelInfo,
  GuildInfo,
  FriendInfo,
  NyankenCooldown,
  SelectedPartner,
} from '../types/game.js';
import userDefaults from '../json/user-defaults.json' with { type: 'json' };
const {
  DEFAULT_EQUIPMENT,
  DEFAULT_OTOMOS,
  DEFAULT_PARTNERS,
  DEFAULT_EQUIPSET,
  DEFAULT_SOCIAL_EQUIP_SETS,
  DEFAULT_OTOMOTEAM,
  DEFAULT_OCEAN_LIST,
} = userDefaults;
const { Schema, model } = mongoose;

export interface IUser extends Document {
  uu_id?: string;
  secret_id?: string;
  login_id?: string;
  transfer?: {
    mst_himitsu_question_id?: string;
    himitsu_answer?: string;
    migration_pass?: string;
    migration_id?: string;
  };
  user_id?: string;
  game_id?: string;
  tutorial_step?: number;
  character_name?: string;
  current_session?: string;
  // Solo per l'amministratore (tools-js/recupera-account.cjs): mai mandati al gioco.
  ultimo_accesso?: Date;
  ultimo_ip?: string;
  // Voci del 探検ナビ gia' riscattate (services/navigazioneService.ts).
  navigazioni_riscattate?: number[];
  // Mappa della storia con la progressione vera (services/progressioneStoria.ts); per ora solo in prova.
  progressione_storia?: boolean;
  comment?: string;
  tutorial_flags: number[];
  model_info?: ModelInfo;
  box?: Box;
  equipset?: {
    capacity_eqp_set: number;
    equip_sets: EquipSet[];
    selected_equip_set_index: number;
  };
  social_equip_sets?: SocialEquipset[];
  otomoteam?: {
    capacity: number;
    otomo_team: OtomoTeam[];
    selected_index: number;
  };
  selected_partner?: SelectedPartner;
  ocean_list: Ocean[];
  cleared_quests: ClearedQuest[];
  nyanken_cooldown?: NyankenCooldown;
  equipment_id_counter?: number;
  guild_info?: GuildInfo;
  friend_info?: FriendInfo;
}
const equipPieceSchema = new Schema({
  created: Number,
  equipment_id: { type: String, default: 'NO_EQUIP' },
  level: Number,
  mst_equipment_id: Number,
  potential: Number,
  skill_level: Number,
});

const equipSetPieceSchema = new Schema({
  equipment_id: { type: String, default: 'NO_EQUIP' },
});
const ClearedQuests = new mongoose.Schema({
  mst_quest_id: {
    type: Number,
    required: true,
  },
  clear_time: {
    type: Number,
    required: false,
  },
});
const equipsetSchema = new Schema({
  index: { type: Number, default: 1 },
  partner_equip_sets: [
    {
      mst_partner_id: Number,
      arm: equipPieceSchema,
      body: equipPieceSchema,
      leg: equipPieceSchema,
      head: equipPieceSchema,
      secret_weapon: equipPieceSchema,
      talisman: equipPieceSchema,
      waist: equipPieceSchema,
      weapon: equipPieceSchema,
    },
  ],
  arm: equipSetPieceSchema,
  body: equipSetPieceSchema,
  leg: equipSetPieceSchema,
  head: equipSetPieceSchema,
  secret_weapon: equipSetPieceSchema,
  talisman: equipSetPieceSchema,
  waist: equipSetPieceSchema,
  weapon: equipSetPieceSchema,
});

const SocialEquipPartSchema = new Schema(
  {
    equipment_id: { type: String, required: true },
    mst_equipment_id: { type: Number, required: true },
  },
  { _id: false },
);

// Define the full SocialEquipset schema
const SocialEquipsetSchema = new Schema(
  {
    gunner: {
      social_arm: { type: SocialEquipPartSchema, required: true },
      social_body: { type: SocialEquipPartSchema, required: true },
      social_head: { type: SocialEquipPartSchema, required: true },
      social_leg: { type: SocialEquipPartSchema, required: true },
      social_waist: { type: SocialEquipPartSchema, required: true },
    },
    knight: {
      social_arm: { type: SocialEquipPartSchema, required: true },
      social_body: { type: SocialEquipPartSchema, required: true },
      social_head: { type: SocialEquipPartSchema, required: true },
      social_leg: { type: SocialEquipPartSchema, required: true },
      social_waist: { type: SocialEquipPartSchema, required: true },
    },
    is_used: { type: Number, required: true },
    mst_partner_id: { type: Number, required: true },
  },
  { _id: false },
);

const userSchema = new Schema({
  uu_id: String,
  secret_id: String,
  login_id: String,
  transfer: {
    mst_himitsu_question_id: String,
    himitsu_answer: String,
    migration_pass: String,
    migration_id: String,
  },
  user_id: String,
  game_id: String,
  tutorial_step: Number,
  character_name: String,
  // Ultimo login riuscito e da quale IP (scritti da registraAccesso in
  // accountService). Facoltativi: gli account vecchi semplicemente non li hanno.
  ultimo_accesso: Date,
  ultimo_ip: String,
  navigazioni_riscattate: { type: [Number], default: [] },
  progressione_storia: { type: Boolean, default: false },
  current_session: String,
  comment: String,
  tutorial_flags: [Number],
  model_info: {
    face: Number,
    gender: Number,
    hair: Number,
    hair_color: Number,
    inner: Number,
    skin: Number,
  },
  box: {
    capacity: {
      // L'originale era 100. Portato a 200 quando il corredo iniziale era di
      // 117 pezzi; dal 29/09 il corredo e' tornato ai 17 pezzi originali, ma la
      // capienza e' 500 per tutti (come Heroic69) per lasciare spazio a gacha ed eventi.
      eqp_box: { type: Number, default: 500 },
      eqp_set: { type: Number, default: 100 },
      friend_max: { type: Number, default: 100 },
    },
    equipments: {
      type: [equipmentSchema],
      default: DEFAULT_EQUIPMENT,
    },
    growth_items: [growthItemSchema],
    limiteds: [limitedSchema],
    matatabis: [matatabiSchema],
    materials: [materialSchema],
    monument: {
      augite: [augiteSchema],
      hr: { type: Number, default: 0 },
      mlv: {
        atk: { type: Number, default: 0 },
        def: { type: Number, default: 0 },
        hp: { type: Number, default: 0 },
        sp: { type: Number, default: 0 },
      },
    },
    otomos: {
      type: [otomoSchema],
      default: DEFAULT_OTOMOS,
    },
    partners: {
      type: [partnerSchema],
      default: DEFAULT_PARTNERS,
    },
    payments: [paymentSchema],
    points: [pointSchema],
    powers: [powerSchema],
    zeny: { type: Number, default: 100000 },
  },
  equipset: {
    capacity_eqp_set: { type: Number, default: 5 },
    equip_sets: {
      type: [equipsetSchema],
      default: DEFAULT_EQUIPSET,
    },
    selected_equip_set_index: { type: Number, default: 1 },
  },
  social_equip_sets: {
    type: [SocialEquipsetSchema],
    default: DEFAULT_SOCIAL_EQUIP_SETS,
  },
  otomoteam: {
    capacity: { type: Number, default: 1 },
    otomo_team: {
      type: [otomoTeamSchema],
      default: DEFAULT_OTOMOTEAM,
    },
    selected_index: { type: Number, default: 1 },
  },
  selected_partner: {
    main_partner_id: { type: String, default: 'PT_CHAR_ID_001' },
    quest_partner_id: { type: String, default: 'PT_CHAR_ID_001' },
  },
  ocean_list: {
    type: [OceanSchema],
    default: DEFAULT_OCEAN_LIST,
  },
  cleared_quests: {
    type: [ClearedQuests],
    default: [],
  },
  nyanken_cooldown: {
    mst_nyanken_id: { type: Number, default: 0 },
    // Spedizione gia' pagata in 狩玉 e non ancora conclusa (vedi nyanken start).
    pagata: { type: Boolean, default: false },
    last_draw_time: { type: Number, default: 0 },
  },
  equipment_id_counter: { type: Number, default: 0 },
  guild_info: {
    gid: { type: String, default: '' },
    is_guild: { type: Number, default: 0 },
    is_same: { type: Number, default: 0 },
    member_type: { type: Number, default: 0 },
    name: { type: String, default: '' },
    rank: { type: Number, default: 0 },
    login_freq: { type: Number, default: 0 },
    chat_freq: { type: Number, default: 0 },
    yarikomi: { type: Number, default: 0 },
    mood: { type: Number, default: 0 },
    timezone: { type: Number, default: 0 },
    waited: { type: Number, default: 0 },
    receive: {
      type: [
        {
          _id: { type: String, required: true },
          created: { type: Number, default: 0 },
          gid: { type: String, required: true },
          uid: { type: String, required: true },
        },
      ],
      default: [],
    },
    send: {
      type: [
        {
          _id: { type: String, required: true },
          created: { type: Number, default: 0 },
          gid: { type: String, required: true },
          uid: { type: String, required: true },
        },
      ],
      default: [],
    },
  },
  // "狩友" (Hunting Friend): relazione 1 a 1, stessa forma di guild_info.send/
  // receive sopra ma senza gid (qui non c'e' nessun gruppo). list = amicizie
  // confermate, receive = richieste ricevute in attesa, send = richieste
  // inviate in attesa (tenuta anche qui, non solo sull'altro utente, per non
  // dover interrogare tutti gli altri account solo per sapere "ho gia'
  // mandato una richiesta a questo?").
  friend_info: {
    list: {
      type: [
        {
          _id: false,
          uid: { type: String, required: true },
          created: { type: Number, default: 0 },
        },
      ],
      default: [],
    },
    receive: {
      type: [
        {
          _id: { type: String, required: true },
          created: { type: Number, default: 0 },
          uid: { type: String, required: true },
        },
      ],
      default: [],
    },
    send: {
      type: [
        {
          _id: { type: String, required: true },
          created: { type: Number, default: 0 },
          uid: { type: String, required: true },
        },
      ],
      default: [],
    },
  },
});

const User = model<IUser>('User', userSchema);
export default User;
