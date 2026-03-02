#!/usr/bin/env bash
# =============================================================================
# PaperLens — Development Deployment Script
# =============================================================================
# Starts all services (Docker PostgreSQL/Redis, Next.js dev server, BullMQ
# worker) in the right order with a single command. Supports restart, stop,
# status, and log tailing.
#
# Usage:
#   ./deploy.sh              Start everything (or restart if already running)
#   ./deploy.sh --stop       Stop all services
#   ./deploy.sh --status     Show process/container status
#   ./deploy.sh --logs       Tail dev + worker logs
#   ./deploy.sh --help       Show full usage info
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Color / formatting helpers (respects NO_COLOR and non-TTY)
# ---------------------------------------------------------------------------
if [[ -z "${NO_COLOR:-}" ]] && [[ -t 1 ]]; then
    RED=$'\033[0;31m'
    GREEN=$'\033[0;32m'
    YELLOW=$'\033[0;33m'
    BLUE=$'\033[0;34m'
    CYAN=$'\033[0;36m'
    BOLD=$'\033[1m'
    DIM=$'\033[2m'
    RESET=$'\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' CYAN='' BOLD='' DIM='' RESET=''
fi

info()    { echo -e "${BLUE}ℹ${RESET}  $*"; }
success() { echo -e "${GREEN}✔${RESET}  $*"; }
warn()    { echo -e "${YELLOW}⚠${RESET}  $*"; }
error()   { echo -e "${RED}✖${RESET}  $*" >&2; }
header()  { echo -e "\n${BOLD}${CYAN}── $* ──${RESET}\n"; }

# ---------------------------------------------------------------------------
# Project root guard
# ---------------------------------------------------------------------------
if [[ ! -f "package.json" ]] || ! grep -q '"paperlens"' package.json 2>/dev/null; then
    error "This script must be run from the PaperLens project root."
    echo "  cd /path/to/paperlens && ./deploy.sh"
    exit 1
fi

# ---------------------------------------------------------------------------
# Directories
# ---------------------------------------------------------------------------
PID_DIR=".pids"
LOG_DIR=".logs"
mkdir -p "$PID_DIR" "$LOG_DIR"

# ---------------------------------------------------------------------------
# Parse flags
# ---------------------------------------------------------------------------
ACTION="start"
SKIP_SETUP=false
SKIP_DOCKER=false
SKIP_INSTALL=false
SKIP_MIGRATE=false
RUN_SEED=false

usage() {
    cat <<EOF
${BOLD}PaperLens Deploy${RESET} — start all services with a single command

${BOLD}Usage:${RESET}
  ./deploy.sh [flags]

${BOLD}Actions:${RESET}
  ${BOLD}(default)${RESET}          Start/restart all services
  ${BOLD}-s, --stop${RESET}         Stop all services and exit
  ${BOLD}-l, --logs${RESET}         Tail dev + worker logs
  ${BOLD}    --status${RESET}       Show process/container status
  ${BOLD}-D, --destroy${RESET}      Remove all data, volumes, and config (requires confirmation)
  ${BOLD}-h, --help${RESET}         Show this help message

${BOLD}Options:${RESET}
  ${BOLD}    --skip-setup${RESET}   Skip .env / setup.sh check
  ${BOLD}    --skip-docker${RESET}  Skip Docker restart (app-only changes)
  ${BOLD}    --skip-install${RESET} Skip npm install
  ${BOLD}    --skip-migrate${RESET} Skip Prisma generate + migrate
  ${BOLD}    --seed${RESET}         Run npm run db:seed after migration

${BOLD}Examples:${RESET}
  ./deploy.sh                     # Full start
  ./deploy.sh --skip-docker       # Restart app only (Docker already running)
  ./deploy.sh --seed              # Start everything and seed the database
  ./deploy.sh --stop              # Stop everything
  ./deploy.sh --destroy           # Remove all data and start fresh
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)         usage; exit 0 ;;
        -s|--stop)         ACTION="stop" ;;
        -l|--logs)         ACTION="logs" ;;
        --status)          ACTION="status" ;;
        -D|--destroy)      ACTION="destroy" ;;
        --skip-setup)      SKIP_SETUP=true ;;
        --skip-docker)     SKIP_DOCKER=true ;;
        --skip-install)    SKIP_INSTALL=true ;;
        --skip-migrate)    SKIP_MIGRATE=true ;;
        --seed)            RUN_SEED=true ;;
        *)
            error "Unknown flag: $1"
            echo "  Run ./deploy.sh --help for usage."
            exit 1
            ;;
    esac
    shift
done

# ---------------------------------------------------------------------------
# Process management helpers
# ---------------------------------------------------------------------------

# Check if a PID is alive
pid_alive() {
    local pid="$1"
    kill -0 "$pid" 2>/dev/null
}

# Read PID from file, return empty if stale/missing
read_pid() {
    local name="$1"
    local pidfile="$PID_DIR/${name}.pid"
    if [[ -f "$pidfile" ]]; then
        local pid
        pid=$(<"$pidfile")
        if pid_alive "$pid"; then
            echo "$pid"
        else
            rm -f "$pidfile"
        fi
    fi
}

# Stop a process by name (SIGTERM → wait → SIGKILL)
stop_process() {
    local name="$1"
    local pid
    pid=$(read_pid "$name")
    if [[ -z "$pid" ]]; then
        return 0
    fi

    info "Stopping ${name} (PID ${pid})..."
    kill "$pid" 2>/dev/null || true

    # Wait up to 5 seconds for graceful shutdown
    local waited=0
    while pid_alive "$pid" && [[ $waited -lt 5 ]]; do
        sleep 1
        ((++waited))
    done

    # Force kill if still alive
    if pid_alive "$pid"; then
        warn "${name} did not stop gracefully, sending SIGKILL..."
        kill -9 "$pid" 2>/dev/null || true
    fi

    rm -f "$PID_DIR/${name}.pid"
    success "${name} stopped"
}

# Rotate log if > 10MB
rotate_log() {
    local logfile="$1"
    if [[ -f "$logfile" ]]; then
        local size
        size=$(wc -c < "$logfile" 2>/dev/null || echo 0)
        if [[ $size -gt 10485760 ]]; then
            mv "$logfile" "${logfile}.old"
        fi
    fi
}

# ---------------------------------------------------------------------------
# Action: --stop
# ---------------------------------------------------------------------------
do_stop() {
    header "Stopping PaperLens services"

    stop_process "dev"
    stop_process "worker"

    if ! $SKIP_DOCKER; then
        if command -v docker &>/dev/null && docker compose ps --quiet 2>/dev/null | grep -q .; then
            info "Stopping Docker containers..."
            docker compose stop
            success "Docker containers stopped"
        else
            info "No Docker containers running"
        fi
    fi

    echo ""
    success "All services stopped"
}

# ---------------------------------------------------------------------------
# Action: --destroy
# ---------------------------------------------------------------------------
do_destroy() {
    header "Destroy PaperLens deployment"

    echo -e "${RED}${BOLD}This will permanently remove:${RESET}"
    echo -e "  • Docker containers and volumes (pgdata, redisdata)"
    echo -e "  • .storage/  (uploaded files)"
    echo -e "  • .pids/     (process PID files)"
    echo -e "  • .logs/     (application logs)"
    echo -e "  • .next/     (build cache)"
    echo -e "  • .env       (environment config)"
    echo -e "  • .env.backup"
    echo ""
    echo -e "${YELLOW}This action cannot be undone.${RESET}"
    echo ""

    read -r -p "Are you sure? [y/N] " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        info "Cancelled."
        exit 0
    fi

    echo ""

    # Stop application processes
    stop_process "dev"
    stop_process "worker"

    # Stop Docker and remove volumes
    if command -v docker &>/dev/null && docker compose ps --quiet 2>/dev/null | grep -q .; then
        info "Removing Docker containers and volumes..."
        docker compose down -v --remove-orphans
        success "Docker containers and volumes removed"
    else
        info "No Docker containers to remove"
    fi

    # Remove data directories
    for dir in .storage .pids .logs .next; do
        if [[ -d "$dir" ]]; then
            rm -rf "$dir"
            success "Removed $dir/"
        fi
    done

    # Remove env files
    for f in .env .env.backup; do
        if [[ -f "$f" ]]; then
            rm -f "$f"
            success "Removed $f"
        fi
    done

    echo ""
    success "All PaperLens data has been removed."
    echo ""
    echo -e "  To start fresh, run:"
    echo -e "    ${BOLD}./deploy.sh${RESET}"
    echo ""
}

# ---------------------------------------------------------------------------
# Action: --status
# ---------------------------------------------------------------------------
do_status() {
    header "PaperLens Service Status"

    # Dev server
    local dev_pid
    dev_pid=$(read_pid "dev")
    if [[ -n "$dev_pid" ]]; then
        echo -e "  ${GREEN}●${RESET}  Next.js dev server  ${DIM}PID ${dev_pid}${RESET}"
    else
        echo -e "  ${RED}●${RESET}  Next.js dev server  ${DIM}not running${RESET}"
    fi

    # Worker
    local worker_pid
    worker_pid=$(read_pid "worker")
    if [[ -n "$worker_pid" ]]; then
        echo -e "  ${GREEN}●${RESET}  BullMQ worker       ${DIM}PID ${worker_pid}${RESET}"
    else
        echo -e "  ${RED}●${RESET}  BullMQ worker       ${DIM}not running${RESET}"
    fi

    # Docker
    echo ""
    if command -v docker &>/dev/null; then
        if docker compose ps --status running 2>/dev/null | grep -q "postgres"; then
            echo -e "  ${GREEN}●${RESET}  PostgreSQL          ${DIM}docker${RESET}"
        else
            echo -e "  ${RED}●${RESET}  PostgreSQL          ${DIM}not running${RESET}"
        fi
        if docker compose ps --status running 2>/dev/null | grep -q "redis"; then
            echo -e "  ${GREEN}●${RESET}  Redis               ${DIM}docker${RESET}"
        else
            echo -e "  ${RED}●${RESET}  Redis               ${DIM}not running${RESET}"
        fi
    else
        echo -e "  ${RED}●${RESET}  Docker              ${DIM}not installed${RESET}"
    fi

    echo ""
}

# ---------------------------------------------------------------------------
# Action: --logs
# ---------------------------------------------------------------------------
do_logs() {
    local dev_log="$LOG_DIR/dev.log"
    local worker_log="$LOG_DIR/worker.log"

    if [[ ! -f "$dev_log" ]] && [[ ! -f "$worker_log" ]]; then
        error "No log files found. Start services first with ./deploy.sh"
        exit 1
    fi

    info "Tailing logs (Ctrl+C to stop)..."
    echo ""
    tail -f "$dev_log" "$worker_log" 2>/dev/null
}

# ---------------------------------------------------------------------------
# Action: start (default)
# ---------------------------------------------------------------------------
do_start() {
    echo ""
    echo -e "${BOLD}PaperLens Deploy${RESET}"
    echo -e "${DIM}Starting all services...${RESET}"

    # ── Pre-flight checks ─────────────────────────────────────────────────
    header "Pre-flight checks"

    if ! $SKIP_DOCKER; then
        if ! command -v docker &>/dev/null; then
            error "Docker is not installed. Install Docker Desktop or use --skip-docker."
            exit 1
        fi
        if ! docker info &>/dev/null 2>&1; then
            error "Docker daemon is not running. Start Docker Desktop or use --skip-docker."
            exit 1
        fi
        success "Docker is running"
    fi

    # Check Node.js version
    if ! command -v node &>/dev/null; then
        error "Node.js is not installed."
        exit 1
    fi
    local node_major
    node_major=$(node -v | sed 's/v//' | cut -d. -f1)
    if [[ "$node_major" -lt 20 ]]; then
        error "Node.js 20+ is required (you have $(node -v))."
        exit 1
    fi
    success "Node.js $(node -v)"

    if ! command -v npm &>/dev/null; then
        error "npm is not available."
        exit 1
    fi
    success "npm $(npm -v)"

    # ── Environment ───────────────────────────────────────────────────────
    if ! $SKIP_SETUP; then
        if [[ ! -f ".env" ]]; then
            header "Environment setup"
            if [[ -f "setup.sh" ]]; then
                info "No .env file found. Running setup.sh..."
                bash setup.sh
                if [[ ! -f ".env" ]]; then
                    error "setup.sh did not create .env. Cannot continue."
                    exit 1
                fi
            else
                error "No .env file found and setup.sh is missing."
                echo "  Create a .env file manually or use --skip-setup."
                exit 1
            fi
        fi
    fi

    # ── Stop existing processes ───────────────────────────────────────────
    local dev_pid worker_pid
    dev_pid=$(read_pid "dev")
    worker_pid=$(read_pid "worker")

    if [[ -n "$dev_pid" ]] || [[ -n "$worker_pid" ]]; then
        header "Stopping existing processes"
        stop_process "dev"
        stop_process "worker"
    fi

    # ── Docker ────────────────────────────────────────────────────────────
    if ! $SKIP_DOCKER; then
        header "Docker containers"
        info "Starting PostgreSQL and Redis..."
        docker compose up -d --force-recreate
        success "Containers started"

        # Health check: PostgreSQL
        info "Waiting for PostgreSQL..."
        local pg_waited=0
        while ! docker compose exec -T postgres pg_isready -U paperlens &>/dev/null; do
            if [[ $pg_waited -ge 30 ]]; then
                error "PostgreSQL failed to become ready within 30 seconds."
                exit 1
            fi
            sleep 1
            ((++pg_waited))
        done
        success "PostgreSQL is ready (${pg_waited}s)"

        # Health check: Redis
        info "Waiting for Redis..."
        local redis_waited=0
        while ! docker compose exec -T redis redis-cli ping &>/dev/null; do
            if [[ $redis_waited -ge 15 ]]; then
                error "Redis failed to become ready within 15 seconds."
                exit 1
            fi
            sleep 1
            ((++redis_waited))
        done
        success "Redis is ready (${redis_waited}s)"
    fi

    # ── npm install ───────────────────────────────────────────────────────
    if ! $SKIP_INSTALL; then
        header "Dependencies"
        info "Running npm install..."
        npm install
        success "Dependencies installed"
    fi

    # ── Prisma generate + migrate ─────────────────────────────────────────
    if ! $SKIP_MIGRATE; then
        header "Database"
        info "Generating Prisma client..."
        npm run db:generate
        success "Prisma client generated"

        info "Running migrations..."
        npm run db:migrate
        success "Migrations applied"
    fi

    # ── Seed admin user ───────────────────────────────────────────────────
    # Auto-seed when ADMIN_EMAIL and ADMIN_PASSWORD are configured,
    # or when --seed is explicitly passed.
    if $RUN_SEED; then
        header "Seed data"
        info "Running database seed..."
        npm run db:seed
        success "Database seeded"
    elif [[ -f ".env" ]] && grep -q '^ADMIN_EMAIL=.\+' .env && grep -q '^ADMIN_PASSWORD=.\+' .env; then
        header "Seed data"
        info "Admin credentials found in .env, seeding admin user..."
        npm run db:seed
        success "Admin user seeded"
    fi

    # ── Background processes ──────────────────────────────────────────────
    header "Starting application"

    # Rotate logs if needed
    rotate_log "$LOG_DIR/dev.log"
    rotate_log "$LOG_DIR/worker.log"

    # Add session timestamp to logs
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "" >> "$LOG_DIR/dev.log"
    echo "=== Session started: $timestamp ===" >> "$LOG_DIR/dev.log"
    echo "" >> "$LOG_DIR/worker.log"
    echo "=== Session started: $timestamp ===" >> "$LOG_DIR/worker.log"

    # Start dev server
    info "Starting Next.js dev server..."
    npm run dev >> "$LOG_DIR/dev.log" 2>&1 &
    echo $! > "$PID_DIR/dev.pid"
    success "Dev server started (PID $!)"

    # Start worker
    info "Starting BullMQ worker..."
    npm run worker >> "$LOG_DIR/worker.log" 2>&1 &
    echo $! > "$PID_DIR/worker.pid"
    success "Worker started (PID $!)"

    # ── Verify ────────────────────────────────────────────────────────────
    sleep 2

    local all_ok=true
    dev_pid=$(read_pid "dev")
    worker_pid=$(read_pid "worker")

    if [[ -z "$dev_pid" ]]; then
        error "Dev server failed to start. Check .logs/dev.log"
        all_ok=false
    fi
    if [[ -z "$worker_pid" ]]; then
        error "Worker failed to start. Check .logs/worker.log"
        all_ok=false
    fi

    # ── Summary ───────────────────────────────────────────────────────────
    header "Ready"

    if $all_ok; then
        echo -e "  ${GREEN}●${RESET}  Next.js dev server  ${DIM}PID ${dev_pid}${RESET}  →  ${BOLD}http://localhost:3000${RESET}"
        echo -e "  ${GREEN}●${RESET}  BullMQ worker       ${DIM}PID ${worker_pid}${RESET}"
        if ! $SKIP_DOCKER; then
            echo -e "  ${GREEN}●${RESET}  PostgreSQL          ${DIM}:5432${RESET}"
            echo -e "  ${GREEN}●${RESET}  Redis               ${DIM}:6379${RESET}"
        fi
        echo ""
        echo -e "  ${DIM}Logs:${RESET}     ./deploy.sh --logs"
        echo -e "  ${DIM}Status:${RESET}   ./deploy.sh --status"
        echo -e "  ${DIM}Stop:${RESET}     ./deploy.sh --stop"
        echo -e "  ${DIM}Restart:${RESET}  ./deploy.sh"
        echo ""
    else
        warn "Some services failed to start. Check logs for details."
        echo ""
        exit 1
    fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
case "$ACTION" in
    start)   do_start ;;
    stop)    do_stop ;;
    status)  do_status ;;
    logs)    do_logs ;;
    destroy) do_destroy ;;
esac
