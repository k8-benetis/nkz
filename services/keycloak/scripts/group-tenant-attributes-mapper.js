// =============================================================================
// Group Tenant Attributes Protocol Mapper Script
// =============================================================================
// This script extracts tenant attributes from user's groups and adds them
// as claims to the JWT token.
//
// Mapped attributes:
//   - tenant_id: From group attribute "tenant_id"
//   - tenant_type: From group attribute "tenant_type"
//   - plan_type: From group attribute "plan_type" (if different from tenant_type)
//   - max_users: From group attribute "max_users"
//   - max_robots: From group attribute "max_robots"
//   - max_sensors: From group attribute "max_sensors"
// =============================================================================

var groups = user.getGroups();
var tenantId = null;
var tenantType = null;
var planType = null;
var maxUsers = null;
var maxRobots = null;
var maxSensors = null;

// Iterate through user's groups to find tenant attributes
for (var i = 0; i < groups.size(); i++) {
    var group = groups.get(i);
    var attributes = group.getAttributes();
    
    // Check for tenant_id attribute
    if (attributes.containsKey("tenant_id")) {
        var tenantIdValues = attributes.get("tenant_id");
        if (tenantIdValues != null && tenantIdValues.size() > 0) {
            tenantId = tenantIdValues.get(0);
        }
    }
    
    // Check for tenant_type attribute
    if (attributes.containsKey("tenant_type")) {
        var tenantTypeValues = attributes.get("tenant_type");
        if (tenantTypeValues != null && tenantTypeValues.size() > 0) {
            tenantType = tenantTypeValues.get(0);
        }
    }
    
    // Check for plan_type attribute
    if (attributes.containsKey("plan_type")) {
        var planTypeValues = attributes.get("plan_type");
        if (planTypeValues != null && planTypeValues.size() > 0) {
            planType = planTypeValues.get(0);
        }
    }
    
    // Check for max_users attribute
    if (attributes.containsKey("max_users")) {
        var maxUsersValues = attributes.get("max_users");
        if (maxUsersValues != null && maxUsersValues.size() > 0) {
            try {
                maxUsers = parseInt(maxUsersValues.get(0));
            } catch (e) {
                // If parsing fails, use string
                maxUsers = maxUsersValues.get(0);
            }
        }
    }
    
    // Check for max_robots attribute
    if (attributes.containsKey("max_robots")) {
        var maxRobotsValues = attributes.get("max_robots");
        if (maxRobotsValues != null && maxRobotsValues.size() > 0) {
            try {
                maxRobots = parseInt(maxRobotsValues.get(0));
            } catch (e) {
                maxRobots = maxRobotsValues.get(0);
            }
        }
    }
    
    // Check for max_sensors attribute
    if (attributes.containsKey("max_sensors")) {
        var maxSensorsValues = attributes.get("max_sensors");
        if (maxSensorsValues != null && maxSensorsValues.size() > 0) {
            try {
                maxSensors = parseInt(maxSensorsValues.get(0));
            } catch (e) {
                maxSensors = maxSensorsValues.get(0);
            }
        }
    }
    
    // If we found tenant_id, we can break (or continue to find highest priority)
    // For now, take from first group that has tenant_id
    if (tenantId != null) {
        break;
    }
}

// Add claims to token if found
if (tenantId != null) {
    token.setOtherClaims("tenant_id", tenantId);
}
if (tenantType != null) {
    token.setOtherClaims("tenant_type", tenantType);
}
if (planType != null) {
    token.setOtherClaims("plan_type", planType);
}
if (maxUsers != null) {
    token.setOtherClaims("max_users", maxUsers);
}
if (maxRobots != null) {
    token.setOtherClaims("max_robots", maxRobots);
}
if (maxSensors != null) {
    token.setOtherClaims("max_sensors", maxSensors);
}
