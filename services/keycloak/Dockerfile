# =============================================================================
# Keycloak with PostgreSQL Driver and Script Mappers - Quarkus Build Method
# =============================================================================

FROM quay.io/keycloak/keycloak:26.4.7

# Copy PostgreSQL driver to providers directory
COPY services/keycloak/postgresql-42.7.1.jar /opt/keycloak/providers/

# Copy script mappers JAR to providers directory
# The JAR contains the JavaScript mapper script and META-INF descriptor
COPY services/keycloak/keycloak-script-mappers.jar /opt/keycloak/providers/

# Build Keycloak with PostgreSQL driver and script mappers
# Enable scripts feature for script-based protocol mappers
# Include all runtime options in build to avoid configuration mismatch
RUN /opt/keycloak/bin/kc.sh build \
    --db=postgres \
    --features=scripts \
    --http-relative-path=/auth \
    --health-enabled=true \
    --transaction-xa-enabled=false

# Switch to keycloak user
USER keycloak

# Expose port
EXPOSE 8080

# Start Keycloak in optimized mode
CMD ["start", "--optimized"]