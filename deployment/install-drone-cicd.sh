#!/bin/bash
set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRONE_DIR="${SCRIPT_DIR}/drone-pipelines"

echo "=========================================="
echo "  Drone CI/CD Installation Script"
echo "=========================================="

# Check if drone-pipelines directory exists
if [ ! -d "$DRONE_DIR" ]; then
    echo "Error: drone-pipelines directory not found at $DRONE_DIR"
    exit 1
fi

# 1. Deploy Drone Secret
echo ""
echo "[1/3] Deploying Drone Secret..."
kubectl apply -f "${DRONE_DIR}/drone-secret.yaml"

# 2. Deploy Drone Server
echo ""
echo "[2/3] Deploying Drone Server..."
kubectl apply -f "${DRONE_DIR}/kubespark-drone-server.yaml"

# 3. Deploy Drone Runner
echo ""
echo "[3/3] Deploying Drone Runner..."
kubectl apply -f "${DRONE_DIR}/kubespark-drone-runner.yaml"

echo ""
echo "=========================================="
echo "  ✓ Drone CI/CD installation complete!"
echo "=========================================="
echo ""
echo "Check Drone deployment status:"
echo "  kubectl get pods -n kubespark"
echo ""
echo "Check all Drone resources:"
echo "  kubectl get all -n kubespark"
echo ""
