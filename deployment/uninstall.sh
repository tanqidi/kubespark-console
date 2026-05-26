#!/bin/bash
set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRONE_DIR="${SCRIPT_DIR}/drone-pipelines"

echo "=========================================="
echo "  KubeSpark & Drone CI/CD Uninstall Script"
echo "=========================================="
echo ""
echo "WARNING: This will delete ALL resources in the kubespark namespace!"
echo ""
read -p "Are you sure you want to continue? (y/n): " CONFIRM

if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Uninstall cancelled."
    exit 0
fi

echo ""
echo "=========================================="
echo "  Starting uninstall..."
echo "=========================================="

# Uninstall Drone CI/CD first
if [ -d "$DRONE_DIR" ]; then
    echo ""
    echo "[1/3] Uninstalling Drone Runner..."
    kubectl delete -f "${DRONE_DIR}/kubespark-drone-runner.yaml" 2>/dev/null || true
    
    echo ""
    echo "[2/3] Uninstalling Drone Server..."
    kubectl delete -f "${DRONE_DIR}/kubespark-drone-server.yaml" 2>/dev/null || true
    
    echo ""
    echo "[3/3] Uninstalling Drone Secret..."
    kubectl delete -f "${DRONE_DIR}/drone-secret.yaml" 2>/dev/null || true
fi

# Uninstall KubeSpark components
echo ""
echo "[4/9] Uninstalling Console..."
kubectl delete -f "${SCRIPT_DIR}/kubespark-console.yaml" 2>/dev/null || true

echo ""
echo "[5/9] Uninstalling Terminal..."
kubectl delete -f "${SCRIPT_DIR}/kubespark-terminal.yaml" 2>/dev/null || true

echo ""
echo "[6/9] Uninstalling KubeSpark core..."
kubectl delete -f "${SCRIPT_DIR}/kubespark.yaml" 2>/dev/null || true

echo ""
echo "[7/9] Uninstalling Secret..."
kubectl delete -f "${SCRIPT_DIR}/kubespark-secret.yaml" 2>/dev/null || true

echo ""
echo "[8/9] Uninstalling RBAC..."
kubectl delete -f "${SCRIPT_DIR}/kubespark-rbac.yaml" 2>/dev/null || true

# Uninstall CRDs
echo ""
echo "[9/9] Uninstalling CRDs..."
for crd_file in "${SCRIPT_DIR}/crds"/*.yaml; do
    if [ -f "$crd_file" ]; then
        echo "Uninstalling: $(basename "$crd_file")"
        kubectl delete -f "$crd_file" 2>/dev/null || true
    fi
done

# Finally delete namespace
echo ""
echo "Deleting kubespark namespace..."
kubectl delete namespace kubespark 2>/dev/null || true

echo ""
echo "=========================================="
echo "  ✓ Uninstall complete!"
echo "=========================================="
echo ""
echo "All resources in kubespark namespace have been deleted."
echo ""
