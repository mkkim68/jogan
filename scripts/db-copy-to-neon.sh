#!/usr/bin/env bash
# 로컬 Docker DB(jogan-db)를 빈 원격 DB(Neon)로 통째로 옮긴다 — 스키마·데이터·마이그레이션 기록까지.
# 마이그레이션 기록(drizzle.__drizzle_migrations)이 같이 가므로 옮긴 뒤 `pnpm db:migrate`는 아무것도 하지 않는다.
#
#   NEON_DATABASE_URL='postgres://...neon.tech/neondb?sslmode=require' pnpm db:copy-to-neon
#
# - 대상이 비어 있지 않으면 아무것도 하지 않고 멈춘다. 덮어쓰기는 지원하지 않는다.
# - 한 트랜잭션으로 넣는다. 중간에 실패하면 대상은 빈 채로 남는다.
# - 로그인 세션(sessions) 데이터는 옮기지 않는다. localhost 쿠키에 묶인 것이라 배포 도메인에서 쓸모가 없다.
#   사용자·Google 계정 연결(accounts)은 옮기므로 배포 후 같은 Google 계정으로 로그인하면 같은 사용자가 된다.
# - pg_dump·psql은 jogan-db 컨테이너 안의 것(PostgreSQL 17)을 쓴다. 로컬에 클라이언트를 깔 필요가 없고,
#   대상 URL은 컨테이너 안에서 연결된다(그래서 호스트의 localhost:5433 같은 주소는 쓸 수 없다).
set -euo pipefail

CONTAINER=jogan-db
SRC_DB=jogan
SRC_USER=jogan
TARGET="${NEON_DATABASE_URL:-}"

if [ -z "$TARGET" ]; then
  echo "NEON_DATABASE_URL이 없다. Neon 콘솔의 연결 문자열을 넣어 실행한다:" >&2
  echo "  NEON_DATABASE_URL='postgres://...' pnpm db:copy-to-neon" >&2
  exit 1
fi

if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" != "true" ]; then
  echo "$CONTAINER 컨테이너가 꺼져 있다. docker start $CONTAINER" >&2
  exit 1
fi

src() { docker exec "$CONTAINER" psql -U "$SRC_USER" -d "$SRC_DB" -XAtq -v ON_ERROR_STOP=1 "$@"; }
dst() { docker exec -i "$CONTAINER" psql "$TARGET" -XAtq -v ON_ERROR_STOP=1 "$@"; }

echo "[copy] 대상 연결 확인"
dst -c 'select version()' | sed 's/^/[copy]   /'

existing=$(dst -c "select count(*) from pg_tables where schemaname in ('public', 'drizzle')")
if [ "$existing" != "0" ]; then
  echo "[copy] 대상에 이미 테이블이 ${existing}개 있다 — 빈 DB에만 옮긴다. 멈춘다." >&2
  exit 1
fi

# 원본 테이블 목록과 행 수 (옮긴 뒤 대조용). sessions는 데이터를 옮기지 않으므로 대조에서도 뺀다
tables=$(src -c "select schemaname || '.' || tablename from pg_tables
                 where schemaname in ('public', 'drizzle') and tablename <> 'sessions' order by 1")

echo "[copy] 덤프 → 대상 (한 트랜잭션)"
# --no-owner/--no-acl: 로컬 역할(jogan)이 Neon에는 없다
# --no-comments: COMMENT ON EXTENSION은 확장 소유자만 할 수 있어 Neon에서 실패한다
docker exec "$CONTAINER" pg_dump -U "$SRC_USER" -d "$SRC_DB" \
    --no-owner --no-acl --no-comments \
    --exclude-table-data=public.sessions \
  | dst --single-transaction > /dev/null

echo "[copy] 행 수 대조"
mismatch=0
for t in $tables; do
  a=$(src -c "select count(*) from $t")
  b=$(dst -c "select count(*) from $t")
  mark="ok"
  if [ "$a" != "$b" ]; then mark="불일치"; mismatch=1; fi
  printf '[copy]   %-36s %8s → %8s  %s\n' "$t" "$a" "$b" "$mark"
done

if [ "$mismatch" -ne 0 ]; then
  echo "[copy] 행 수가 다른 테이블이 있다 — 위를 확인한다." >&2
  exit 1
fi
echo "[copy] 완료. 원격에서 'pnpm db:migrate'를 돌려도 적용할 마이그레이션이 없어야 정상이다."
