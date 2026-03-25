#!/usr/bin/env bash
set -euo pipefail

# Usage: ./summarize-group.sh <group-name> [week] [post-count]
#   week: "current" (default), "previous", or "weekXX" (e.g. week03, week52)
# Examples:
#   ./summarize-group.sh skjs
#   ./summarize-group.sh skjs previous
#   ./summarize-group.sh skjs week12
#   ./summarize-group.sh skjs current 100

GROUP_NAME="${1:?Usage: ./summarize-group.sh <group-name> [current|previous|weekXX] [post-count]}"
WEEK_ARG="${2:-current}"
POST_COUNT="${3:-100}"

# Compute week start (Monday) and end (Sunday 23:59:59) as ISO timestamps
compute_week_range() {
  local week_arg="$1"
  local year week_num monday_date sunday_date

  year=$(date +%Y)

  case "$week_arg" in
    current)
      # Current ISO week number
      week_num=$(date +%V)
      ;;
    previous)
      # Go back 7 days, get that week number
      week_num=$(date -v-7d +%V 2>/dev/null || date -d "7 days ago" +%V)
      # Handle year boundary (if previous week is in last year)
      local prev_year
      prev_year=$(date -v-7d +%Y 2>/dev/null || date -d "7 days ago" +%Y)
      year="$prev_year"
      ;;
    week[0-9][0-9])
      week_num="${week_arg#week}"
      ;;
    *)
      echo "Error: invalid week argument '$week_arg'" >&2
      echo "Use 'current', 'previous', or 'weekXX' (e.g. week03, week52)" >&2
      exit 1
      ;;
  esac

  # Strip leading zero for arithmetic
  local wn=$((10#$week_num))
  if [ "$wn" -lt 1 ] || [ "$wn" -gt 53 ]; then
    echo "Error: week number must be between 01 and 53, got '$week_num'" >&2
    exit 1
  fi

  # macOS date: compute Monday of ISO week
  # Jan 4 is always in ISO week 1. Find Monday of week 1, then offset.
  local jan4_dow
  jan4_dow=$(date -j -f "%Y-%m-%d" "${year}-01-04" +%u 2>/dev/null)
  if [ -n "$jan4_dow" ]; then
    # macOS date
    local jan4_epoch
    jan4_epoch=$(date -j -f "%Y-%m-%d" "${year}-01-04" +%s)
    local week1_monday_epoch=$(( jan4_epoch - (jan4_dow - 1) * 86400 ))
    local target_monday_epoch=$(( week1_monday_epoch + (wn - 1) * 7 * 86400 ))
    local target_sunday_epoch=$(( target_monday_epoch + 6 * 86400 ))
    monday_date=$(date -r "$target_monday_epoch" +%Y-%m-%d)
    sunday_date=$(date -r "$target_sunday_epoch" +%Y-%m-%d)
  else
    # GNU date fallback
    monday_date=$(date -d "${year}-01-04 -$(date -d "${year}-01-04" +%u) days + 1 day + $((wn - 1)) weeks" +%Y-%m-%d)
    sunday_date=$(date -d "$monday_date + 6 days" +%Y-%m-%d)
  fi

  WEEK_START="${monday_date}T00:00:00Z"
  WEEK_END="${sunday_date}T23:59:59Z"
  WEEK_LABEL="week ${week_num} ${year} (${monday_date} → ${sunday_date})"
}

compute_week_range "$WEEK_ARG"

# Load .env
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

DB_URL="${POSTGRESQL_ADDON_URI:?Missing POSTGRESQL_ADDON_URI in .env}"
GRAPHQL_URL="${SLASHWORK_GRAPHQL_URL:?Missing SLASHWORK_GRAPHQL_URL in .env}"

# Fetch group ID and auth token from the prod DB
DB_ROW=$(psql "$DB_URL" -t -A -F '|' -c "
  SELECT g.slashwork_id, at.token
  FROM groups g
  JOIN auth_tokens at ON g.auth_token = at.name
  WHERE g.name = '$GROUP_NAME'
")

if [ -z "$DB_ROW" ]; then
  echo "Error: group '$GROUP_NAME' not found in database" >&2
  echo "Available groups:" >&2
  psql "$DB_URL" -t -A -c "SELECT name FROM groups ORDER BY name" >&2
  exit 1
fi

GROUP_ID=$(echo "$DB_ROW" | cut -d'|' -f1)
AUTH_TOKEN=$(echo "$DB_ROW" | cut -d'|' -f2)

echo "Fetching posts from '$GROUP_NAME' for $WEEK_LABEL..." >&2

QUERY='query FetchGroupPosts($groupId: ID!, $first: Int!) {
  fetch__Group(id: $groupId) {
    name
    posts(first: $first) {
      edges {
        node {
          id
          markdown
          created
          author { id name }
          comments(first: 100) {
            edges {
              node {
                markdown
                created
                author { name }
                replies(first: 100) {
                  edges {
                    node {
                      markdown
                      created
                      author { name }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}'

PAYLOAD=$(jq -n \
  --arg query "$QUERY" \
  --arg groupId "$GROUP_ID" \
  --argjson first "$POST_COUNT" \
  '{query: $query, variables: {groupId: $groupId, first: $first}}')

RESPONSE=$(curl -s -f "$GRAPHQL_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -d "$PAYLOAD")

# Check for API errors
API_ERRORS=$(echo "$RESPONSE" | jq -r '.errors // [] | .[].message' 2>/dev/null)
if [ -n "$API_ERRORS" ]; then
  echo "GraphQL error: $API_ERRORS" >&2
  exit 1
fi

# Extract and format messages, filtering by week date range
MESSAGES=$(echo "$RESPONSE" | jq -r --arg start "$WEEK_START" --arg end "$WEEK_END" '
  [(.data.fetch__Group.posts // {edges:[]}).edges[].node
   | select(.created >= $start and .created <= $end)]
  | if length == 0 then empty else
    .[] |
    "--- \(.author.name) [\(.created)] ---\n\(.markdown)\n" +
    ([(.comments // {edges:[]}).edges[].node |
      "  > \(.author.name) [\(.created)]:\n  \(.markdown)\n" +
      ([(.replies // {edges:[]}).edges[].node |
        "    >> \(.author.name) [\(.created)]:\n    \(.markdown)"
      ] | join("\n"))
    ] | join("\n"))
  end
')

if [ -z "$MESSAGES" ]; then
  echo "No messages found in group '$GROUP_NAME' for $WEEK_LABEL"
  exit 0
fi

POST_TOTAL=$(echo "$RESPONSE" | jq --arg start "$WEEK_START" --arg end "$WEEK_END" '
  [(.data.fetch__Group.posts // {edges:[]}).edges[].node | select(.created >= $start and .created <= $end)] | length
')
echo "Found $POST_TOTAL posts for $WEEK_LABEL" >&2

SUMMARY=$(echo "$MESSAGES" | claude -p "Summarize the following messages from the '$GROUP_NAME' group for $WEEK_LABEL. Give a concise overview of the key topics, decisions, and action items discussed:")

echo "$SUMMARY"
