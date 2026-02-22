#!/bin/bash
# =============================================================================
# ROS2 Tenant Creation Script - Dynamic ROS2 Configuration per Tenant
# =============================================================================
# This script creates ROS2-specific resources for a tenant dynamically
# Usage: ./create-tenant-ros2.sh <tenant-id>

set -euo pipefail

# Configuration
TENANT_ID="${1:-}"
# Ensure tenant_id doesn't already have 'nekazari-' prefix
if [[ "${TENANT_ID}" == nekazari-* ]]; then
    TENANT_ID="${TENANT_ID#nekazari-}"
fi
# Ensure tenant_id doesn't already have 'nekazari-tenant-' prefix
if [[ "${TENANT_ID}" == nekazari-tenant-* ]]; then
    TENANT_ID="${TENANT_ID#nekazari-tenant-}"
fi
# Construct namespace with proper prefix (nekazari-tenant-)
NAMESPACE="nekazari-tenant-${TENANT_ID}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
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

# Validation
if [[ -z "${TENANT_ID}" ]]; then
    log_error "Tenant ID is required"
    echo "Usage: $0 <tenant-id>"
    echo "Example: $0 tenant1"
    exit 1
fi

if [[ ! "${TENANT_ID}" =~ ^[a-z0-9-]+$ ]]; then
    log_error "Tenant ID must contain only lowercase letters, numbers, and hyphens"
    exit 1
fi

log_info "Creating ROS2 resources for tenant: ${TENANT_ID} in namespace: ${NAMESPACE}"

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    log_error "kubectl is not installed or not in PATH"
    exit 1
fi

# Check if namespace exists
if ! kubectl get namespace "${NAMESPACE}" &> /dev/null; then
    log_error "Namespace ${NAMESPACE} does not exist. Please create tenant first."
    exit 1
fi

# Create ROS2-specific ConfigMap
log_info "Creating ROS2 configuration for tenant: ${TENANT_ID}"
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: ConfigMap
metadata:
  name: ${TENANT_ID}-ros2-config
  namespace: ${NAMESPACE}
  labels:
    tenant-id: ${TENANT_ID}
    app: ros2-config
data:
  ros2_domain_id: "$(($(echo ${TENANT_ID} | wc -c) + 100))"
  tenant_id: "${TENANT_ID}"
  mqtt_broker: "mosquitto-service.nekazari-system.svc.cluster.local"
  mqtt_port: "1883"
  mqtt_topic_prefix: "nekazari/${TENANT_ID}"
  fiware_context: "${CONTEXT_URL}"
  orion_ld_url: "http://orion-ld-service.nekazari-system.svc.cluster.local:1026"
  prometheus_url: "http://prometheus-service.nekazari-system.svc.cluster.local:9090"
  grafana_url: "http://grafana-service.nekazari-system.svc.cluster.local:3000"
EOF

# Create ROS2 Bridge Service
log_info "Creating ROS2 Bridge service for tenant: ${TENANT_ID}"
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${TENANT_ID}-ros2-bridge
  namespace: ${NAMESPACE}
  labels:
    app: ros2-bridge
    tenant-id: ${TENANT_ID}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ros2-bridge
      tenant-id: ${TENANT_ID}
  template:
    metadata:
      labels:
        app: ros2-bridge
        tenant-id: ${TENANT_ID}
    spec:
      serviceAccountName: ${TENANT_ID}-sa
      containers:
      - name: ros2-bridge
        image: ros:jazzy-ros-base
        command: ["/bin/bash"]
        args:
        - -c
        - |
          set -euo pipefail
          
          echo "Starting ROS2 Bridge for tenant: ${TENANT_ID}"
          
          # Set ROS2 domain ID
          export ROS_DOMAIN_ID=\$(cat /etc/ros2-config/ros2_domain_id)
          
          # Install required packages
          apt-get update && apt-get install -y \
            ros-jazzy-ros2-bridge \
            ros-jazzy-mqtt-bridge \
            python3-pip \
            mosquitto-clients
          
          # Create bridge configuration
          mkdir -p /opt/ros2-bridge/config
          
          cat > /opt/ros2-bridge/config/bridge.yaml << 'BRIDGE_EOF'
          ros__parameters:
            bridge:
              - ros__parameters:
                  type: ros2_to_mqtt
                  topic: /robot/status
                  mqtt_topic: nekazari/${TENANT_ID}/robot/status
                  qos: 1
              - ros__parameters:
                  type: mqtt_to_ros2
                  topic: /robot/commands
                  mqtt_topic: nekazari/${TENANT_ID}/robot/commands
                  qos: 1
              - ros__parameters:
                  type: ros2_to_mqtt
                  topic: /sensors/data
                  mqtt_topic: nekazari/${TENANT_ID}/sensors/data
                  qos: 1
          BRIDGE_EOF
          
          # Start ROS2 bridge
          ros2 run ros2_bridge ros2_bridge --ros-args --params-file /opt/ros2-bridge/config/bridge.yaml &
          
          # Keep container running
          wait
        env:
        - name: ROS_DOMAIN_ID
          valueFrom:
            configMapKeyRef:
              name: ${TENANT_ID}-ros2-config
              key: ros2_domain_id
        - name: TENANT_ID
          value: ${TENANT_ID}
        - name: MQTT_BROKER
          valueFrom:
            configMapKeyRef:
              name: ${TENANT_ID}-ros2-config
              key: mqtt_broker
        - name: MQTT_PORT
          valueFrom:
            configMapKeyRef:
              name: ${TENANT_ID}-ros2-config
              key: mqtt_port
        volumeMounts:
        - name: ros2-config
          mountPath: /etc/ros2-config
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "500m"
      volumes:
      - name: ros2-config
        configMap:
          name: ${TENANT_ID}-ros2-config
---
apiVersion: v1
kind: Service
metadata:
  name: ${TENANT_ID}-ros2-bridge-service
  namespace: ${NAMESPACE}
  labels:
    tenant-id: ${TENANT_ID}
spec:
  selector:
    app: ros2-bridge
    tenant-id: ${TENANT_ID}
  ports:
  - port: 11811
    targetPort: 11811
    name: ros2-discovery
  - port: 1883
    targetPort: 1883
    name: mqtt-bridge
EOF

# Create ROS2 Robot Simulator (for testing)
log_info "Creating ROS2 Robot Simulator for tenant: ${TENANT_ID}"
cat <<EOF | kubectl apply -f -
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${TENANT_ID}-robot-simulator
  namespace: ${NAMESPACE}
  labels:
    app: robot-simulator
    tenant-id: ${TENANT_ID}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: robot-simulator
      tenant-id: ${TENANT_ID}
  template:
    metadata:
      labels:
        app: robot-simulator
        tenant-id: ${TENANT_ID}
    spec:
      serviceAccountName: ${TENANT_ID}-sa
      containers:
      - name: robot-simulator
        image: ros:jazzy-ros-base
        command: ["/bin/bash"]
        args:
        - -c
        - |
          set -euo pipefail
          
          echo "Starting ROS2 Robot Simulator for tenant: ${TENANT_ID}"
          
          # Set ROS2 domain ID
          export ROS_DOMAIN_ID=\$(cat /etc/ros2-config/ros2_domain_id)
          
          # Install required packages
          apt-get update && apt-get install -y \
            ros-jazzy-turtlesim \
            ros-jazzy-teleop-twist-keyboard \
            python3-pip
          
          # Create robot simulation script
          cat > /opt/robot_sim.py << 'ROBOT_EOF'
          #!/usr/bin/env python3
          import rclpy
          from rclpy.node import Node
          from std_msgs.msg import String
          from geometry_msgs.msg import Twist
          import json
          import time
          import os
          
          class RobotSimulator(Node):
              def __init__(self):
                  super().__init__('robot_simulator')
                  self.tenant_id = os.getenv('TENANT_ID', 'unknown')
                  
                  # Publishers
                  self.status_publisher = self.create_publisher(String, '/robot/status', 10)
                  self.sensor_publisher = self.create_publisher(String, '/sensors/data', 10)
                  
                  # Subscribers
                  self.command_subscriber = self.create_subscription(
                      Twist, '/robot/commands', self.command_callback, 10)
                  
                  # Timer for status updates
                  self.timer = self.create_timer(5.0, self.publish_status)
                  self.sensor_timer = self.create_timer(2.0, self.publish_sensor_data)
                  
                  self.get_logger().info(f'Robot Simulator started for tenant: {self.tenant_id}')
              
              def command_callback(self, msg):
                  self.get_logger().info(f'Received command: linear={msg.linear.x}, angular={msg.angular.z}')
              
              def publish_status(self):
                  status = {
                      'tenant_id': self.tenant_id,
                      'timestamp': time.time(),
                      'status': 'active',
                      'battery': 85.0,
                      'position': {'x': 1.0, 'y': 2.0, 'z': 0.0},
                      'orientation': {'x': 0.0, 'y': 0.0, 'z': 0.0, 'w': 1.0}
                  }
                  
                  msg = String()
                  msg.data = json.dumps(status)
                  self.status_publisher.publish(msg)
              
              def publish_sensor_data(self):
                  sensor_data = {
                      'tenant_id': self.tenant_id,
                      'timestamp': time.time(),
                      'temperature': 22.5,
                      'humidity': 65.0,
                      'soil_moisture': 70.0,
                      'light_level': 800.0
                  }
                  
                  msg = String()
                  msg.data = json.dumps(sensor_data)
                  self.sensor_publisher.publish(msg)
          
          def main():
              rclpy.init()
              node = RobotSimulator()
              
              try:
                  rclpy.spin(node)
              except KeyboardInterrupt:
                  pass
              finally:
                  node.destroy_node()
                  rclpy.shutdown()
          
          if __name__ == '__main__':
              main()
          ROBOT_EOF
          
          chmod +x /opt/robot_sim.py
          
          # Start robot simulator
          python3 /opt/robot_sim.py
        env:
        - name: ROS_DOMAIN_ID
          valueFrom:
            configMapKeyRef:
              name: ${TENANT_ID}-ros2-config
              key: ros2_domain_id
        - name: TENANT_ID
          value: ${TENANT_ID}
        volumeMounts:
        - name: ros2-config
          mountPath: /etc/ros2-config
        resources:
          requests:
            memory: "128Mi"
            cpu: "50m"
          limits:
            memory: "256Mi"
            cpu: "200m"
      volumes:
      - name: ros2-config
        configMap:
          name: ${TENANT_ID}-ros2-config
EOF

# Create Network Policy for ROS2 communication
log_info "Creating network policies for ROS2 communication"
cat <<EOF | kubectl apply -f -
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: ros2-communication
  namespace: ${NAMESPACE}
  labels:
    tenant-id: ${TENANT_ID}
    policy-type: ros2
spec:
  podSelector:
    matchLabels:
      tenant-id: ${TENANT_ID}
  policyTypes:
  - Ingress
  - Egress
  
  ingress:
  - from:
    - podSelector:
        matchLabels:
          tenant-id: ${TENANT_ID}
    ports:
    - protocol: UDP
      port: 11811  # ROS2 discovery
    - protocol: TCP
      port: 1883   # MQTT
  
  egress:
  - to:
    - podSelector:
        matchLabels:
          tenant-id: ${TENANT_ID}
    ports:
    - protocol: UDP
      port: 11811  # ROS2 discovery
    - protocol: TCP
      port: 1883   # MQTT
  - to: []
    ports:
    - protocol: TCP
      port: 53     # DNS
    - protocol: UDP
      port: 53     # DNS
EOF

# Wait for deployments to be ready
log_info "Waiting for ROS2 deployments to be ready..."
kubectl wait --for=condition=available deployment/${TENANT_ID}-ros2-bridge -n ${NAMESPACE} --timeout=300s
kubectl wait --for=condition=available deployment/${TENANT_ID}-robot-simulator -n ${NAMESPACE} --timeout=300s

# Verify ROS2 resources
log_info "Verifying ROS2 resources for tenant: ${TENANT_ID}"
kubectl get pods -n "${NAMESPACE}" -l tenant-id="${TENANT_ID}"
kubectl get services -n "${NAMESPACE}" -l tenant-id="${TENANT_ID}"
kubectl get configmaps -n "${NAMESPACE}" -l tenant-id="${TENANT_ID}"

log_success "ROS2 resources created successfully for tenant: ${TENANT_ID}"
log_info "ROS2 Domain ID: $(kubectl get configmap ${TENANT_ID}-ros2-config -n ${NAMESPACE} -o jsonpath='{.data.ros2_domain_id}')"
log_info "MQTT Topic Prefix: nekazari/${TENANT_ID}"
log_info "Network access: provision devices via Device Management (Headscale SDN)"

# Create ROS2 cleanup script
log_info "Creating ROS2 cleanup script for tenant: ${TENANT_ID}"
cat > "${PROJECT_ROOT}/scripts/cleanup-ros2-${TENANT_ID}.sh" <<EOF
#!/bin/bash
# ROS2 cleanup script for tenant: ${TENANT_ID}
# Usage: ./cleanup-ros2-${TENANT_ID}.sh

set -euo pipefail

echo "Cleaning up ROS2 resources for tenant: ${TENANT_ID}"
kubectl delete deployment ${TENANT_ID}-ros2-bridge -n ${NAMESPACE} --ignore-not-found=true
kubectl delete deployment ${TENANT_ID}-robot-simulator -n ${NAMESPACE} --ignore-not-found=true
kubectl delete service ${TENANT_ID}-ros2-bridge-service -n ${NAMESPACE} --ignore-not-found=true
kubectl delete configmap ${TENANT_ID}-ros2-config -n ${NAMESPACE} --ignore-not-found=true
kubectl delete networkpolicy ros2-communication -n ${NAMESPACE} --ignore-not-found=true
rm -f "${PROJECT_ROOT}/scripts/cleanup-ros2-${TENANT_ID}.sh"
echo "ROS2 cleanup completed for tenant: ${TENANT_ID}"
EOF

chmod +x "${PROJECT_ROOT}/scripts/cleanup-ros2-${TENANT_ID}.sh"

log_success "ROS2 tenant creation completed!"
log_info "To clean up ROS2 resources, run: ./scripts/cleanup-ros2-${TENANT_ID}.sh"
