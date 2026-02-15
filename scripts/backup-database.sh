#!/bin/bash

# =============================================================================
# Database Backup Script for Nekazari Platform
# =============================================================================
# This script creates backups of all PostgreSQL databases
# Usage: ./scripts/backup-database.sh [--compress] [--output-dir /path]

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
BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Default values
COMPRESS=false
OUTPUT_DIR="$BACKUP_DIR"

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
    echo "Database Backup Script for Nekazari Platform"
    echo ""
    echo "Usage:"
    echo "  $0                           # Create uncompressed backups"
    echo "  $0 --compress               # Create compressed backups"
    echo "  $0 --output-dir /path       # Specify output directory"
    echo "  $0 --help                   # Show this help"
    echo ""
    echo "Backups will be saved to: $OUTPUT_DIR"
    echo "Format: database_name_YYYYMMDD_HHMMSS.sql[.gz]"
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --compress)
                COMPRESS=true
                shift
                ;;
            --output-dir)
                OUTPUT_DIR="$2"
                shift 2
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
    
    # Create backup directory
    mkdir -p "$OUTPUT_DIR"
    
    log_success "All requirements satisfied"
}

get_databases() {
    # Get list of databases (excluding system databases)
    docker exec "$DB_CONTAINER" psql -U "$DB_USER" -t -c "
        SELECT datname FROM pg_database 
        WHERE datistemplate = false 
        AND datname NOT IN ('postgres', 'template0', 'template1')
        ORDER BY datname;
    " | tr -d ' ' | grep -v '^$'
}

backup_database() {
    local database="$1"
    local backup_file="$OUTPUT_DIR/${database}_${TIMESTAMP}.sql"
    
    log_info "Backing up database: $database"
    
    # Create the backup
    if docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$database" > "$backup_file"; then
        local file_size=$(du -h "$backup_file" | cut -f1)
        log_success "Backed up $database ($file_size)"
        
        # Compress if requested
        if [ "$COMPRESS" = true ]; then
            log_info "Compressing backup..."
            gzip "$backup_file"
            local compressed_size=$(du -h "${backup_file}.gz" | cut -f1)
            log_success "Compressed to ${compressed_size}"
            backup_file="${backup_file}.gz"
        fi
        
        echo "$backup_file"
    else
        log_error "Failed to backup $database"
        return 1
    fi
}

cleanup_old_backups() {
    local retention_days="${BACKUP_RETENTION_DAYS:-30}"
    
    log_info "Cleaning up backups older than $retention_days days..."
    
    find "$OUTPUT_DIR" -name "*.sql" -o -name "*.sql.gz" | while read -r backup_file; do
        if [ -f "$backup_file" ]; then
            local file_age=$(($(date +%s) - $(stat -c %Y "$backup_file")))
            local age_days=$((file_age / 86400))
            
            if [ $age_days -gt $retention_days ]; then
                log_info "Removing old backup: $(basename "$backup_file") ($age_days days old)"
                rm -f "$backup_file"
            fi
        fi
    done
    
    log_success "Cleanup completed"
}

show_backup_info() {
    log_success "Backup completed successfully!"
    echo ""
    echo "============================================================================="
    echo "BACKUP INFORMATION"
    echo "============================================================================="
    echo ""
    echo "📁 Backup location: $OUTPUT_DIR"
    echo "📅 Timestamp: $TIMESTAMP"
    echo "🗜️  Compression: $([ "$COMPRESS" = true ] && echo "Enabled" || echo "Disabled")"
    echo ""
    echo "📊 Backup files:"
    ls -lh "$OUTPUT_DIR"/*_${TIMESTAMP}.* 2>/dev/null | while read -r line; do
        echo "   $line"
    done
    echo ""
    echo "💾 Total size:"
    du -sh "$OUTPUT_DIR"/*_${TIMESTAMP}.* 2>/dev/null | awk '{print "   " $1 " total"}'
    echo ""
    echo "🔄 To restore a backup:"
    echo "   ./scripts/restore-database.sh $OUTPUT_DIR/database_name_${TIMESTAMP}.sql"
    echo ""
}

# Main function
main() {
    echo "============================================================================="
    echo "Nekazari Database Backup Script"
    echo "============================================================================="
    echo ""
    
    # Parse command line arguments
    parse_arguments "$@"
    
    # Check requirements
    check_requirements
    
    # Get list of databases
    local databases=($(get_databases))
    
    if [ ${#databases[@]} -eq 0 ]; then
        log_warning "No databases found to backup"
        exit 0
    fi
    
    log_info "Found ${#databases[@]} databases to backup"
    
    # Backup each database
    local backup_files=()
    for database in "${databases[@]}"; do
        if backup_file=$(backup_database "$database"); then
            backup_files+=("$backup_file")
        else
            log_error "Backup failed for $database"
            exit 1
        fi
    done
    
    # Cleanup old backups
    cleanup_old_backups
    
    # Show backup information
    show_backup_info
    
    log_success "Backup process completed!"
}

# Run main function
main "$@"
