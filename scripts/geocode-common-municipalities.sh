#!/bin/bash
# =============================================================================
# Geocode Common Municipalities Script
# =============================================================================
# Adds coordinates to common Spanish municipalities that are likely to be used
# This ensures weather-worker can find municipalities with coordinates
# =============================================================================

set -e

NAMESPACE="${NAMESPACE:-nekazari}"
POSTGRES_POD=$(kubectl get pods -n "$NAMESPACE" -l app=postgresql -o jsonpath='{.items[0].metadata.name}')

if [ -z "$POSTGRES_POD" ]; then
    echo "❌ ERROR: PostgreSQL pod not found in namespace $NAMESPACE"
    exit 1
fi

echo "🌍 Geocoding common municipalities..."
echo "PostgreSQL pod: $POSTGRES_POD"
echo ""

# Common municipalities with known coordinates (major cities)
# Format: ine_code|name|latitude|longitude
COMMON_MUNICIPALITIES=(
    "31001|Pamplona|42.8169|-1.6432"
    "28079|Madrid|40.4168|-3.7038"
    "08019|Barcelona|41.3851|2.1734"
    "41091|Sevilla|37.3891|-5.9845"
    "46015|Valencia|39.4699|-0.3763"
    "15030|A Coruña|43.3623|-8.4115"
    "29067|Málaga|36.7213|-4.4214"
    "33044|Oviedo|43.3619|-5.8494"
    "48020|Bilbao|43.2627|-2.9253"
    "50059|Zaragoza|41.6488|-0.8891"
    "18087|Granada|37.1773|-3.5986"
    "23050|Jaén|37.7796|-3.7849"
    "24089|León|42.5987|-5.5671"
    "26089|Logroño|42.4650|-2.4456"
    "27028|Lugo|43.0123|-7.5562"
    "30030|Murcia|37.9922|-1.1307"
    "32054|Ourense|42.3360|-7.8642"
    "35013|Las Palmas de Gran Canaria|28.1248|-15.4300"
    "38038|Santa Cruz de Tenerife|28.4636|-16.2518"
    "39075|Santander|43.4623|-3.8099"
    "45080|Toledo|39.8628|-4.0273"
    "47086|Valladolid|41.6523|-4.7245"
    "49035|Zamora|41.5035|-5.7438"
)

UPDATED=0
for mun_data in "${COMMON_MUNICIPALITIES[@]}"; do
    IFS='|' read -r ine_code name lat lon <<< "$mun_data"
    
    echo "📍 Updating $name ($ine_code): $lat, $lon"
    
    kubectl exec -n "$NAMESPACE" "$POSTGRES_POD" -- psql -U postgres -d nekazari -c "
        UPDATE catalog_municipalities 
        SET 
            latitude = $lat,
            longitude = $lon,
            geom = ST_SetSRID(ST_MakePoint($lon, $lat), 4326)
        WHERE ine_code = '$ine_code'
          AND (latitude IS NULL OR longitude IS NULL OR geom IS NULL);
    " > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        UPDATED=$((UPDATED + 1))
        echo "  ✅ Updated"
    else
        echo "  ⚠️  Error or already has coordinates"
    fi
done

echo ""
echo "=========================================="
echo "✅ Geocoding complete: $UPDATED municipalities updated"
echo ""
echo "Verifying..."
kubectl exec -n "$NAMESPACE" "$POSTGRES_POD" -- psql -U postgres -d nekazari -c "
    SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN 1 END) as with_coords
    FROM catalog_municipalities;
"




























