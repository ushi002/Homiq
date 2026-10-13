# Version shown in the app (login page, footer, profile): date and short hash of the current commit.
# Source it before building, e.g. in update.sh:
#   . ./version-env.sh && docker compose up -d --build
# Without it the app shows "unknown version".
export APP_COMMIT="$(git rev-parse --short HEAD 2>/dev/null)"
export APP_DATE="$(git log -1 --format=%cd --date=format:%Y.%m.%d 2>/dev/null)"
