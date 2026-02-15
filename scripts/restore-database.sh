#!/bin/bash

# =============================================================================
# Database Restore Script for Nekazari Platform
# =============================================================================
# This script restores PostgreSQL databases from backup files
# Usage: ./scripts/restore-database.sh backup_file.sql [--database db_name]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DB_CONTAINER="fiware-postgresql"
DB_USER="timescale"

# Default values
TARGET_DATABASE=""
FORCE=false

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
    echo "Database Restore Script for Nekazari Platform"
    echo ""
    echo "Usage:"
    echo "  $0 backup_file.sql                    # Restore to original database name"
    echo "  $0 backup_file.sql --database db_name # Restore to specific database"
    echo "  $0 backup_file.sql --force            # Force restore (overwrite existing)"
    echo "  $0 --help                             # Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 backups/keycloak_20241005_120000.sql"
    echo "  $0 backups/keycloak_20241005_120000.sql.gz --database keycloak_restored"
    echo "  $0 backups/keycloak_20241005_120000.sql --force"
}

parse_arguments() {
    if [ $# -eq 0 ]; then
        log_error "No backup file specified"
        show_help
        exit 1
    fi
    
    BACKUP_FILE="$1"
    shift
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --database)
                TARGET_DATABASE="$2"
                shift 2
                ;;
            --force)
                FORCE=true
                shift
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

check_requirements() {
    log_info "Checking requirements..."
    
    # Check if backup file exists
    if [ ! -f "$BACKUP_FILE" ]; then
        log_error "Backup file not found: $BACKUP_FILE"
        exit 1
    fi
    
    # Check if PostgreSQL container is running
    if ! docker ps --format "{{.Names}}" | grep -q "^${DB_CONTAINER}$"; then
        log_error "PostgreSQL container '$DB_CONTAINER' is not running"
        log_info "Please start the services first: sudo ./scripts/deploy.sh --non-interactive"
        exit 1
    fi
    
    # Check if we can connect to PostgreSQL
    if ! docker exec "$DB_CONTAINER" pg_isready -U "$DB_USER" > /dev/null 2>&1; then
        log_error "Cannot connect to PostgreSQL"
        exit 1
    fi
    
    log_success "All requirements satisfied"
}

detect_database_name() {
    local backup_file="$1"
    local filename=$(basename "$backup_file")
    
    # Extract database name from filename (format: database_name_YYYYMMDD_HHMMSS.sql)
    local db_name=$(echo "$filename" | sed 's/_[0-9]\{8\}_[0-9]\{6\}\.sql.*$//')
    
    if [ -z "$db_name" ]; then
        log_error "Cannot detect database name from filename: $filename"
        log_info "Expected format: database_name_YYYYMMDD_HHMMSS.sql"
        exit 1
    fi
    
    echo "$db_name"
}

check_database_exists() {
    local database="$1"
    
    local exists=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -t -c "
        SELECT 1 FROM pg_database WHERE datname = '$database';
    " 2>/dev/null | tr -d ' ' | grep -v '^$' || echo "")
    
    [ -n "$exists" ]
}

create_database() {
    local database="$1"
    
    log_info "Creating database: $database"
    
    if docker exec "$DB_CONTAINER" psql -U "$DB_USER" -c "CREATE DATABASE $database;" > /dev/null 2>&1; then
        log_success "Database created: $database"
    else
        log_error "Failed to create database: $database"
        return 1
    fi
}

restore_database() {
    local backup_file="$1"
    local target_database="$2"
    
    log_info "Restoring database: $target_database"
    
    # Check if file is compressed
    if [[ "$backup_file" == *.gz ]]; then
        log_info "Detected compressed backup file"
        if docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$target_database" < <(gunzip -c "$backup_file"); then
            log_success "Restored compressed backup to $target_database"
        else
            log_error "Failed to restore compressed backup"
            return 1
        fi
    else
        if docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" -d "$target_database" < "$backup_file"; then
            log_success "Restored backup to $target_database"
        else
            log_error "Failed to restore backup"
            return 1
        fi
    fi
}

confirm_restore() {
    local target_database="$1"
    
    if [ "$FORCE" = true ]; then
        return 0
    fi
    
    log_warning "This will restore data to database: $target_database"
    if check_database_exists "$target_database"; then
        log_warning "Database '$target_database' already exists and will be overwritten!"
    fi
    
    echo ""
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo ""
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Restore cancelled"
        exit 0
    fi
}

show_restore_info() {
    local backup_file="$1"
    local target_database="$2"
    
    log_success "Restore completed successfully!"
    echo ""
    echo "============================================================================="
    echo "RESTORE INFORMATION"
    echo "============================================================================="
    echo ""
    echo "📁 Backup file: $backup_file"
    echo "🗄️  Target database: $target_database"
    echo "📅 Restored at: $(date)"
    echo ""
    echo "🔍 To verify the restore:"
    echo "   docker exec $DB_CONTAINER psql -U $DB_USER -d $target_database -c '\dt'"
    echo ""
    echo "⚠️  Remember to restart services if needed:"
    echo "   sudo docker-compose -f infrastructure/docker-compose.ngsi-ld.yml restart"
    echo ""
}

# Main function
main() {
    echo "============================================================================="
    echo "Nekazari Database Restore Script"
    echo "============================================================================="
    echo ""
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Check requirements
    check_requirements
    
    # Determine target database
    if [ -z "$TARGET_DATABASE" ]; then
        TARGET_DATABASE=$(detect_database_name "$BACKUP_FILE")
        log_info "Detected database name: $TARGET_DATABASE"
    fi
    
    # Confirm restore
    confirm_restore "$TARGET_DATABASE"
    
    # Create database if it doesn't exist
    if ! check_database_exists "$TARGET_DATABASE"; then
        create_database "$TARGET_DATABASE"
    else
        log_warning "Database '$TARGET_DATABASE' already exists"
        if [ "$FORCE" = false ]; then
            log_error "Use --force to overwrite existing database"
            exit 1
        fi
    fi
    
    # Restore the database
    restore_database "$BACKUP_FILE" "$TARGET_DATABASE"
    
    # Show restore information
    show_restore_info "$BACKUP_FILE" "$TARGET_DATABASE"
    
    log_success "Restore process completed!"
}

# Run main function
main "$@"
