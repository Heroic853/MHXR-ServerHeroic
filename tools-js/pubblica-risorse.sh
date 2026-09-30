#!/bin/sh
# Prepara sulla VPS le cartelle che il gioco chiede quando res_ver sale a <NUOVA>.
#
# Il gioco (sMHiUpdate::reqUpdateStandard) confronta la sua versione salvata con
# res_ver del server:
#   - distanza < 10  -> aggiornamento parziale: chiede d<vecchia>_<nuova>/stdDL/download.list
#     con dentro SOLO i pacchetti cambiati, e scarica solo quelli;
#   - distanza >= 10 o prima installazione -> chiede v<nuova>/stdDL/ (tutto).
# Tutti i file veri stanno in v0282/stdDL/: qui si creano solo collegamenti.
#
#   sh tools-js/pubblica-risorse.sh <NUOVA>    (dalla cartella del progetto, sulla VPS)
set -e
NUOVA=$1
[ -n "$NUOVA" ] || { echo "uso: pubblica-risorse.sh <versione nuova>"; exit 1; }
STORICO="$(pwd)/tools-js/aggiornamenti-risorse.txt"
BASE=src/public/res/download/android
cd "$BASE"
P=$(printf '%04d' "$NUOVA")
[ -e "v$P" ] || ln -s v0282 "v$P"
echo "v$P -> $(readlink "v$P")"
PRIMA=$(grep -v '^#' "$STORICO" | awk '{print $1}' | sort -n | head -1)
V=$((PRIMA - 1))
while [ "$V" -lt "$NUOVA" ]; do
  DIR="d$(printf '%04d' "$V")_$P/stdDL"
  FILE=$(grep -v '^#' "$STORICO" | awk -v v="$V" -v n="$NUOVA" '$1>v && $1<=n {for(i=2;i<=NF;i++) print $i}' | sort -u)
  rm -rf "d$(printf '%04d' "$V")_$P"
  mkdir -p "$DIR"
  : > "$DIR/download.list"
  for F in $FILE; do
    mkdir -p "$DIR/$(dirname "$F")"
    ln -sf "$(dirname "$F" | sed 's|[^/]*|..|g')/../../v0282/stdDL/$F" "$DIR/$F"
    grep "^/stdDL/$F," v0282/stdDL/download.list >> "$DIR/download.list"
  done
  echo "$DIR: $(wc -l < "$DIR/download.list") pacchetti"
  V=$((V + 1))
done
