#!/usr/bin/env bash
# =============================================================================
# PaperLens — Interactive Environment Setup
# =============================================================================
# Generates a .env file by prompting for required configuration values.
# Auto-generates JWT secrets where possible. Safe to re-run: existing values
# become defaults, and unrecognized variables are preserved.
#
# Non-interactive usage (CI/Docker):
#   DATABASE_URL=... REDIS_URL=... JWT_SECRET=... JWT_REFRESH_SECRET=... \
#   AZURE_AI_FOUNDRY_ENDPOINT=... AZURE_AI_FOUNDRY_KEY=... ./setup.sh < /dev/null
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Bash version check — we need 4+ for associative arrays
# ---------------------------------------------------------------------------
if ((BASH_VERSINFO[0] < 4)); then
    echo "ERROR: bash 4+ is required (you have ${BASH_VERSION})."
    echo "On macOS, install a newer bash: brew install bash"
    exit 1
fi

# ---------------------------------------------------------------------------
# Color / formatting helpers (respects NO_COLOR and non-TTY)
# ---------------------------------------------------------------------------
if [[ -z "${NO_COLOR:-}" ]] && [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    BLUE='\033[0;34m'
    CYAN='\033[0;36m'
    BOLD='\033[1m'
    DIM='\033[2m'
    RESET='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' CYAN='' BOLD='' DIM='' RESET=''
fi

info()    { echo -e "${BLUE}ℹ${RESET}  $*"; }
success() { echo -e "${GREEN}✔${RESET}  $*"; }
warn()    { echo -e "${YELLOW}⚠${RESET}  $*"; }
error()   { echo -e "${RED}✖${RESET}  $*" >&2; }
header()  { echo -e "\n${BOLD}${CYAN}── $* ──${RESET}\n"; }

# ---------------------------------------------------------------------------
# Cleanup trap
# ---------------------------------------------------------------------------
cleanup() {
    echo ""
    warn "Setup cancelled."
    exit 130
}
trap cleanup INT

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------
if [[ ! -f "package.json" ]] || ! grep -q '"paperlens"' package.json 2>/dev/null; then
    error "This script must be run from the PaperLens project root."
    echo "  cd /path/to/paperlens && ./setup.sh"
    exit 1
fi

HAS_OPENSSL=false
if command -v openssl &>/dev/null; then
    HAS_OPENSSL=true
fi

INTERACTIVE=true
if [[ ! -t 0 ]]; then
    INTERACTIVE=false
fi

# ---------------------------------------------------------------------------
# .env parser — loads existing values into an associative array
# ---------------------------------------------------------------------------
declare -A EXISTING_ENV
declare -a UNRECOGNIZED_LINES=()

# Variables we manage
KNOWN_VARS=(
    DATABASE_URL REDIS_URL
    JWT_SECRET JWT_REFRESH_SECRET
    AZURE_AI_FOUNDRY_ENDPOINT AZURE_AI_FOUNDRY_KEY AZURE_AI_FOUNDRY_API_VERSION
    AZURE_STORAGE_CONNECTION_STRING AZURE_STORAGE_CONTAINER
    ADMIN_EMAIL ADMIN_PASSWORD ADMIN_NAME
    MAX_UPLOAD_SIZE_MB NODE_ENV
)

load_existing_env() {
    local file="$1"
    [[ -f "$file" ]] || return 0
    while IFS= read -r line || [[ -n "$line" ]]; do
        # Skip blank lines and comments
        [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
        # Parse KEY=VALUE (handles quoted and unquoted)
        if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*) ]]; then
            local key="${BASH_REMATCH[1]}"
            local val="${BASH_REMATCH[2]}"
            # Strip surrounding quotes
            val="${val#\"}" ; val="${val%\"}"
            val="${val#\'}" ; val="${val%\'}"
            EXISTING_ENV["$key"]="$val"
            # Track unrecognized vars
            local known=false
            for k in "${KNOWN_VARS[@]}"; do
                [[ "$k" == "$key" ]] && { known=true; break; }
            done
            if ! $known; then
                UNRECOGNIZED_LINES+=("$line")
            fi
        fi
    done < "$file"
}

# ---------------------------------------------------------------------------
# Handle existing .env
# ---------------------------------------------------------------------------
ENV_FILE=".env"
MODE="create"

if [[ -f "$ENV_FILE" ]]; then
    if $INTERACTIVE; then
        echo ""
        warn "An existing ${BOLD}.env${RESET} file was found."
        echo ""
        echo "  ${BOLD}U${RESET}) Update — keep existing values as defaults"
        echo "  ${BOLD}O${RESET}) Overwrite — back up to .env.backup, start fresh"
        echo "  ${BOLD}C${RESET}) Cancel"
        echo ""
        while true; do
            read -rp "  Choice [U/o/c]: " choice
            case "${choice:-U}" in
                [Uu]|"") MODE="update"; break ;;
                [Oo])    MODE="overwrite"; break ;;
                [Cc])    info "Cancelled."; exit 0 ;;
                *)       echo "  Please enter U, O, or C." ;;
            esac
        done
    else
        # Non-interactive: default to update
        MODE="update"
    fi

    if [[ "$MODE" == "overwrite" ]]; then
        cp "$ENV_FILE" "${ENV_FILE}.backup"
        success "Backed up existing .env to .env.backup"
    fi

    if [[ "$MODE" == "update" || "$MODE" == "overwrite" ]]; then
        load_existing_env "$ENV_FILE"
    fi
fi

# ---------------------------------------------------------------------------
# Prompt helpers
# ---------------------------------------------------------------------------
# Gets a value from: env var → existing .env → user prompt → default
# Usage: prompt_value VAR_NAME "Label" "default" is_secret is_required
declare -A COLLECTED

prompt_value() {
    local var="$1" label="$2" default="${3:-}" is_secret="${4:-false}" is_required="${5:-false}"

    # 1. Check environment variable (for non-interactive / CI)
    local env_val="${!var:-}"
    if [[ -n "$env_val" ]]; then
        COLLECTED["$var"]="$env_val"
        return
    fi

    # 2. Check existing .env value
    local existing="${EXISTING_ENV[$var]:-}"
    local effective_default="${existing:-$default}"

    # 3. Non-interactive: use whatever we have
    if ! $INTERACTIVE; then
        if [[ -n "$effective_default" ]]; then
            COLLECTED["$var"]="$effective_default"
            return
        elif $is_required; then
            error "Required variable ${BOLD}$var${RESET} is not set."
            error "Set it via environment variable or run setup.sh interactively."
            exit 1
        fi
        return
    fi

    # 4. Interactive prompt
    local display_default="$effective_default"
    if $is_secret && [[ -n "$display_default" ]]; then
        # Show masked version for secrets
        local len=${#display_default}
        if ((len > 8)); then
            display_default="${display_default:0:4}...${display_default:$((len-4))}"
        else
            display_default="****"
        fi
    fi

    local prompt_text="  ${label}"
    if [[ -n "$display_default" ]]; then
        prompt_text+=" ${DIM}[${display_default}]${RESET}"
    fi
    if $is_required; then
        prompt_text+=" ${RED}*${RESET}"
    fi
    prompt_text+=": "

    local value
    if $is_secret; then
        read -rsp "$prompt_text" value
        echo ""  # newline after hidden input
    else
        read -rp "$prompt_text" value
    fi

    # Use entered value, or fall back to the effective default
    if [[ -n "$value" ]]; then
        COLLECTED["$var"]="$value"
    elif [[ -n "$effective_default" ]]; then
        COLLECTED["$var"]="$effective_default"
    elif $is_required; then
        error "Required: $label"
        # Retry once
        if $is_secret; then
            read -rsp "  $label: " value
            echo ""
        else
            read -rp "  $label: " value
        fi
        if [[ -z "$value" ]]; then
            error "Cannot continue without $label."
            exit 1
        fi
        COLLECTED["$var"]="$value"
    fi
}

# Generate a secret and let user accept or override
generate_secret() {
    local var="$1" label="$2"

    # Check env var first
    local env_val="${!var:-}"
    if [[ -n "$env_val" ]]; then
        COLLECTED["$var"]="$env_val"
        return
    fi

    # Check existing .env
    local existing="${EXISTING_ENV[$var]:-}"

    # If we have a good existing value, use it
    if [[ -n "$existing" ]] && [[ "$existing" != "change-me"* ]]; then
        if ! $INTERACTIVE; then
            COLLECTED["$var"]="$existing"
            return
        fi
        local masked="${existing:0:4}...${existing:$((${#existing}-4))}"
        echo -e "  ${label}: ${DIM}keeping existing [${masked}]${RESET}"
        read -rp "  Press Enter to keep, or type a new value: " override
        if [[ -n "$override" ]]; then
            COLLECTED["$var"]="$override"
        else
            COLLECTED["$var"]="$existing"
        fi
        return
    fi

    # Generate a new secret
    if $HAS_OPENSSL; then
        local generated
        generated=$(openssl rand -base64 48)
        if ! $INTERACTIVE; then
            COLLECTED["$var"]="$generated"
            return
        fi
        echo -e "  ${label}: ${DIM}auto-generated${RESET}"
        echo -e "    ${DIM}${generated}${RESET}"
        read -rp "  Press Enter to accept, or type your own: " override
        if [[ -n "$override" ]]; then
            COLLECTED["$var"]="$override"
        else
            COLLECTED["$var"]="$generated"
        fi
    else
        if ! $INTERACTIVE; then
            error "Required variable ${BOLD}$var${RESET} is not set and openssl is not available to generate one."
            exit 1
        fi
        warn "openssl not found — enter a secret manually (32+ chars recommended)."
        prompt_value "$var" "$label" "" true true
    fi
}

# URL-encode special characters in a password for use in DATABASE_URL
urlencode_password() {
    local str="$1" encoded="" i char
    for ((i = 0; i < ${#str}; i++)); do
        char="${str:$i:1}"
        case "$char" in
            [a-zA-Z0-9._~-]) encoded+="$char" ;;
            '@') encoded+="%40" ;;
            ':') encoded+="%3A" ;;
            '/') encoded+="%2F" ;;
            '%') encoded+="%25" ;;
            '!') encoded+="%21" ;;
            '#') encoded+="%23" ;;
            '$') encoded+="%24" ;;
            '&') encoded+="%26" ;;
            "'") encoded+="%27" ;;
            '(') encoded+="%28" ;;
            ')') encoded+="%29" ;;
            '*') encoded+="%2A" ;;
            '+') encoded+="%2B" ;;
            ',') encoded+="%2C" ;;
            ';') encoded+="%3B" ;;
            '=') encoded+="%3D" ;;
            '?') encoded+="%3F" ;;
            '[') encoded+="%5B" ;;
            ']') encoded+="%5D" ;;
            ' ') encoded+="%20" ;;
            *)   encoded+="$char" ;;
        esac
    done
    echo "$encoded"
}

# Ask a yes/no question — returns 0 for yes, 1 for no
ask_yn() {
    local prompt="$1" default="${2:-n}"
    if ! $INTERACTIVE; then
        [[ "$default" == "y" ]] && return 0 || return 1
    fi
    local hint="y/N"
    [[ "$default" == "y" ]] && hint="Y/n"
    read -rp "  ${prompt} [${hint}]: " answer
    case "${answer:-$default}" in
        [Yy]*) return 0 ;;
        *)     return 1 ;;
    esac
}

# =============================================================================
# Main flow — collect configuration values
# =============================================================================

echo ""
echo -e "${BOLD}PaperLens Environment Setup${RESET}"
echo -e "${DIM}This script will generate your .env configuration file.${RESET}"

# ── Database ──────────────────────────────────────────────────────────────────
header "Database — PostgreSQL connection"

DB_DEFAULT="postgresql://paperlens:paperlens_dev@localhost:5432/paperlens"
USE_COMPONENTS=false

if $INTERACTIVE; then
    echo -e "  You can enter a full DATABASE_URL or build one from components."
    if ask_yn "Enter as individual components (user, password, host, etc.)?" "n"; then
        USE_COMPONENTS=true
    fi
fi

if $USE_COMPONENTS; then
    prompt_value "_DB_USER" "Database user" "paperlens" false false
    prompt_value "_DB_PASS" "Database password" "paperlens_dev" true false
    prompt_value "_DB_HOST" "Database host" "localhost" false false
    prompt_value "_DB_PORT" "Database port" "5432" false false
    prompt_value "_DB_NAME" "Database name" "paperlens" false false

    local_user="${COLLECTED[_DB_USER]}"
    local_pass="${COLLECTED[_DB_PASS]}"
    local_host="${COLLECTED[_DB_HOST]}"
    local_port="${COLLECTED[_DB_PORT]}"
    local_db="${COLLECTED[_DB_NAME]}"

    encoded_pass=$(urlencode_password "$local_pass")
    COLLECTED[DATABASE_URL]="postgresql://${local_user}:${encoded_pass}@${local_host}:${local_port}/${local_db}"

    # Clean up temp vars
    unset 'COLLECTED[_DB_USER]' 'COLLECTED[_DB_PASS]' 'COLLECTED[_DB_HOST]' 'COLLECTED[_DB_PORT]' 'COLLECTED[_DB_NAME]'
else
    prompt_value DATABASE_URL "DATABASE_URL" "$DB_DEFAULT" false true
fi

success "Database URL configured"

# ── Redis ─────────────────────────────────────────────────────────────────────
header "Redis — job queue and rate limiting"

prompt_value REDIS_URL "REDIS_URL" "redis://localhost:6379" false true
success "Redis URL configured"

# ── Authentication ────────────────────────────────────────────────────────────
header "Authentication — JWT signing secrets"

if $HAS_OPENSSL; then
    echo -e "  ${DIM}Secrets will be auto-generated with openssl.${RESET}"
fi

generate_secret JWT_SECRET "JWT_SECRET"
generate_secret JWT_REFRESH_SECRET "JWT_REFRESH_SECRET"
success "JWT secrets configured"

# ── Azure AI Foundry ──────────────────────────────────────────────────────────
header "Azure AI Foundry — document parsing and summarization"

prompt_value AZURE_AI_FOUNDRY_ENDPOINT "Endpoint URL" "" false true
prompt_value AZURE_AI_FOUNDRY_KEY "API key" "" true true
prompt_value AZURE_AI_FOUNDRY_API_VERSION "API version" "2025-01-01" false false
success "Azure AI Foundry configured"

# ── Azure Blob Storage (optional) ────────────────────────────────────────────
header "Azure Blob Storage — persistent file storage (optional)"

CONFIGURE_BLOB=false
if [[ -n "${EXISTING_ENV[AZURE_STORAGE_CONNECTION_STRING]:-}" ]] || [[ -n "${AZURE_STORAGE_CONNECTION_STRING:-}" ]]; then
    CONFIGURE_BLOB=true
elif ask_yn "Configure Azure Blob Storage?" "n"; then
    CONFIGURE_BLOB=true
fi

if $CONFIGURE_BLOB; then
    prompt_value AZURE_STORAGE_CONNECTION_STRING "Connection string" "" true true
    prompt_value AZURE_STORAGE_CONTAINER "Container name" "paperlens-files" false false
    success "Azure Blob Storage configured"
else
    echo -e "  ${DIM}Skipped — files will be stored locally in .storage/${RESET}"
fi

# ── Admin Seed (optional) ────────────────────────────────────────────────────
header "Admin Seed — first admin user for db:seed (optional)"

CONFIGURE_ADMIN=false
if [[ -n "${EXISTING_ENV[ADMIN_EMAIL]:-}" ]] || [[ -n "${ADMIN_EMAIL:-}" ]]; then
    CONFIGURE_ADMIN=true
elif ask_yn "Configure admin seed user?" "n"; then
    CONFIGURE_ADMIN=true
fi

if $CONFIGURE_ADMIN; then
    prompt_value ADMIN_EMAIL "Admin email" "admin@example.com" false true
    prompt_value ADMIN_PASSWORD "Admin password" "" true true
    prompt_value ADMIN_NAME "Admin name" "Admin" false false
    success "Admin seed configured"
else
    echo -e "  ${DIM}Skipped — you can register the first user through the UI${RESET}"
fi

# ── Application (optional) ───────────────────────────────────────────────────
header "Application — optional settings"

CONFIGURE_APP=false
if [[ -n "${EXISTING_ENV[MAX_UPLOAD_SIZE_MB]:-}" ]] || [[ -n "${EXISTING_ENV[NODE_ENV]:-}" ]]; then
    CONFIGURE_APP=true
elif ask_yn "Configure optional app settings (upload size, NODE_ENV)?" "n"; then
    CONFIGURE_APP=true
fi

if $CONFIGURE_APP; then
    prompt_value MAX_UPLOAD_SIZE_MB "Max upload size (MB)" "50" false false
    prompt_value NODE_ENV "NODE_ENV" "development" false false
    success "Application settings configured"
else
    echo -e "  ${DIM}Skipped — using defaults (50 MB upload, development mode)${RESET}"
fi

# =============================================================================
# Validation
# =============================================================================
header "Validation"

ERRORS=0

for var in DATABASE_URL REDIS_URL JWT_SECRET JWT_REFRESH_SECRET AZURE_AI_FOUNDRY_ENDPOINT AZURE_AI_FOUNDRY_KEY; do
    if [[ -z "${COLLECTED[$var]:-}" ]]; then
        error "Missing required variable: $var"
        ((ERRORS++))
    fi
done

# Warn on short JWT secrets
for var in JWT_SECRET JWT_REFRESH_SECRET; do
    if [[ -n "${COLLECTED[$var]:-}" ]] && ((${#COLLECTED[$var]} < 32)); then
        warn "$var is shorter than 32 characters — consider using a longer secret."
    fi
done

if ((ERRORS > 0)); then
    error "Cannot write .env — $ERRORS required value(s) missing."
    exit 1
fi

success "All required values present"

# =============================================================================
# Write .env
# =============================================================================
header "Writing .env"

{
    cat <<'HEADER'
# =============================================================================
# PaperLens Environment Variables
# =============================================================================
# Generated by setup.sh — re-run ./setup.sh to update.
# =============================================================================
HEADER

    echo ""
    echo "# -- Database (PostgreSQL) ---------------------------------------------------"
    echo "DATABASE_URL=\"${COLLECTED[DATABASE_URL]}\""

    echo ""
    echo "# -- Redis (job queue & rate limiting) ---------------------------------------"
    echo "REDIS_URL=\"${COLLECTED[REDIS_URL]}\""

    echo ""
    echo "# -- Authentication (JWT) ----------------------------------------------------"
    echo "JWT_SECRET=\"${COLLECTED[JWT_SECRET]}\""
    echo "JWT_REFRESH_SECRET=\"${COLLECTED[JWT_REFRESH_SECRET]}\""

    echo ""
    echo "# -- Azure AI Foundry (document parsing & summarization) ---------------------"
    echo "AZURE_AI_FOUNDRY_ENDPOINT=\"${COLLECTED[AZURE_AI_FOUNDRY_ENDPOINT]}\""
    echo "AZURE_AI_FOUNDRY_KEY=\"${COLLECTED[AZURE_AI_FOUNDRY_KEY]}\""
    if [[ -n "${COLLECTED[AZURE_AI_FOUNDRY_API_VERSION]:-}" ]] && [[ "${COLLECTED[AZURE_AI_FOUNDRY_API_VERSION]}" != "2025-01-01" ]]; then
        echo "AZURE_AI_FOUNDRY_API_VERSION=\"${COLLECTED[AZURE_AI_FOUNDRY_API_VERSION]}\""
    else
        echo "# AZURE_AI_FOUNDRY_API_VERSION=\"2025-01-01\""
    fi

    if $CONFIGURE_BLOB; then
        echo ""
        echo "# -- Azure Blob Storage (persistent file storage) ---------------------------"
        echo "AZURE_STORAGE_CONNECTION_STRING=\"${COLLECTED[AZURE_STORAGE_CONNECTION_STRING]}\""
        if [[ -n "${COLLECTED[AZURE_STORAGE_CONTAINER]:-}" ]] && [[ "${COLLECTED[AZURE_STORAGE_CONTAINER]}" != "paperlens-files" ]]; then
            echo "AZURE_STORAGE_CONTAINER=\"${COLLECTED[AZURE_STORAGE_CONTAINER]}\""
        else
            echo "# AZURE_STORAGE_CONTAINER=\"paperlens-files\""
        fi
    fi

    if $CONFIGURE_ADMIN; then
        echo ""
        echo "# -- Admin Seed (npm run db:seed) --------------------------------------------"
        [[ -n "${COLLECTED[ADMIN_EMAIL]:-}" ]]    && echo "ADMIN_EMAIL=\"${COLLECTED[ADMIN_EMAIL]}\""
        [[ -n "${COLLECTED[ADMIN_PASSWORD]:-}" ]]  && echo "ADMIN_PASSWORD=\"${COLLECTED[ADMIN_PASSWORD]}\""
        [[ -n "${COLLECTED[ADMIN_NAME]:-}" ]]      && echo "ADMIN_NAME=\"${COLLECTED[ADMIN_NAME]}\""
    fi

    if $CONFIGURE_APP; then
        echo ""
        echo "# -- Application -------------------------------------------------------------"
        [[ -n "${COLLECTED[MAX_UPLOAD_SIZE_MB]:-}" ]] && echo "MAX_UPLOAD_SIZE_MB=${COLLECTED[MAX_UPLOAD_SIZE_MB]}"
        [[ -n "${COLLECTED[NODE_ENV]:-}" ]]           && echo "NODE_ENV=${COLLECTED[NODE_ENV]}"
    fi

    # Preserve unrecognized variables from the original .env
    if ((${#UNRECOGNIZED_LINES[@]} > 0)); then
        echo ""
        echo "# -- Other (preserved from previous .env) -----------------------------------"
        for line in "${UNRECOGNIZED_LINES[@]}"; do
            echo "$line"
        done
    fi

    echo ""
} > "$ENV_FILE"

success ".env written successfully"

# =============================================================================
# Next steps
# =============================================================================
header "Next Steps"

echo -e "  ${BOLD}1.${RESET} Start infrastructure:"
echo -e "     ${DIM}docker compose up -d${RESET}"
echo ""
echo -e "  ${BOLD}2.${RESET} Set up the database:"
echo -e "     ${DIM}npm run db:generate${RESET}"
echo -e "     ${DIM}npm run db:migrate${RESET}"
if $CONFIGURE_ADMIN; then
    echo ""
    echo -e "  ${BOLD}3.${RESET} Seed the admin user:"
    echo -e "     ${DIM}npm run db:seed${RESET}"
    echo ""
    echo -e "  ${BOLD}4.${RESET} Start the dev server and worker:"
    echo -e "     ${DIM}npm run dev${RESET}"
    echo -e "     ${DIM}npm run worker  ${DIM}# in a separate terminal${RESET}"
else
    echo ""
    echo -e "  ${BOLD}3.${RESET} Start the dev server and worker:"
    echo -e "     ${DIM}npm run dev${RESET}"
    echo -e "     ${DIM}npm run worker  ${DIM}# in a separate terminal${RESET}"
fi
echo ""
echo -e "  Then open ${BOLD}http://localhost:3000${RESET} and register an account."
echo ""
