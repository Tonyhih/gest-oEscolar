#!/usr/bin/env bash
# Cópia de segurança da base de dados (RNF11). Corra semanalmente a partir do seu computador.
# Precisa do pg_dump 16 ou superior (vem com o PostgreSQL ou com o cliente psql).
#
#   DATABASE_URL='postgresql://...neon.tech/gestao_escolar?sslmode=require' ./scripts/copia-seguranca.sh
#
# A cópia tem dados pessoais de menores (Lei n.º 22/11): guarde-a num disco cifrado,
# nunca no GitHub nem em pastas partilhadas. Apague as cópias com mais de 90 dias.
set -euo pipefail

: "${DATABASE_URL:?Defina DATABASE_URL}"
PASTA="${PASTA_COPIAS:-$HOME/copias-gestao-escolar}"
mkdir -p "$PASTA"
chmod 700 "$PASTA"

FICHEIRO="$PASTA/gestao-escolar-$(date +%Y%m%d-%H%M).dump"
pg_dump --format=custom --no-owner --no-privileges --file="$FICHEIRO" "$DATABASE_URL"
chmod 600 "$FICHEIRO"
echo "Cópia criada: $FICHEIRO ($(du -h "$FICHEIRO" | cut -f1))"

# Verifica que a cópia se consegue ler (lista o conteúdo sem repor)
pg_restore --list "$FICHEIRO" > /dev/null && echo "Cópia verificada: o ficheiro é legível."

# Remove cópias com mais de 90 dias
find "$PASTA" -name 'gestao-escolar-*.dump' -mtime +90 -print -delete

# Para repor numa base de dados vazia (teste de reposição, de preferência numa base de testes):
#   pg_restore --no-owner --no-privileges --dbname="$DATABASE_URL_TESTE" "$FICHEIRO"
