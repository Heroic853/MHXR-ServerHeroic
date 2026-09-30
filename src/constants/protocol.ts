export const PROTOCOL = {
  // Versione delle risorse. Il gioco la confronta con quella salvata: se e' diversa
  // (meno di 10 di distanza) rilegge download.list e scarica SOLO i pacchetti cambiati,
  // poi salva questa, quindi non riscarica piu'. L'indirizzo usa il numero:
  // /res/download/android/v0283/stdDL/... (v0283 e' un collegamento alla cartella v0282).
  // Storico in tools-js/aggiornamenti-risorse.txt; le cartelle le crea tools-js/pubblica-risorse.sh.
  // 283: menu inglesi (GUI.00.fpk) e resident allineato. 284: nomi delle armi in inglese.
  RES_VER: 285,
  BANNER_VER: 91, // If set to 0 /api/banner/dllist/get is not called; incremental update trigger
  APP_VER: '09.03.06',
  BLOCK_SEQ: 0, // Possibly need to increment for cycling encryption (client ignores if 0)
} as const;
