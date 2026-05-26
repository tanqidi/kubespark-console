#!/bin/bash
set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=========================================="
echo "  KubeSpark Installation Script"
echo "=========================================="

# 1. Install Namespace
echo ""
echo "[1/6] Installing Namespace..."
kubectl apply -f "${SCRIPT_DIR}/kubespark-namespace.yaml"

# 2. Install RBAC
echo ""
echo "[2/6] Installing RBAC configuration..."
kubectl apply -f "${SCRIPT_DIR}/kubespark-rbac.yaml"

# 3. Configure Secret
echo ""
echo "[3/6] Configuring Secret..."
SECRET_TMP="${SCRIPT_DIR}/kubespark-secret.tmp.yaml"

# Generate random password or JWT Secret function
generate_random_string() {
    local length=$1
    local chars="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?"
    local result=""
    for i in $(seq 1 $length); do
        local rand_index=$((RANDOM % ${#chars}))
        result="${result}${chars:$rand_index:1}"
    done
    echo "$result"
}

# Prompt for password
echo ""
echo "Set KubeSpark admin password (press Enter twice to auto-generate):"
read -s -p "Password: " KUBESPARK_PASSWORD
echo ""
read -s -p "Confirm password: " KUBESPARK_PASSWORD_CONFIRM
echo ""

# Check if both are empty (auto-generate password)
if [ -z "$KUBESPARK_PASSWORD" ] && [ -z "$KUBESPARK_PASSWORD_CONFIRM" ]; then
    KUBESPARK_PASSWORD=$(generate_random_string 32)
    echo "✓ Auto-generated password"
elif [ "$KUBESPARK_PASSWORD" != "$KUBESPARK_PASSWORD_CONFIRM" ]; then
    echo "Error: Passwords do not match!"
    exit 1
elif [ -z "$KUBESPARK_PASSWORD" ]; then
    echo "Error: Password cannot be empty!"
    exit 1
fi

# Generate 64-bit random JWT Secret
KUBESPARK_JWT_SECRET=$(generate_random_string 64)
echo "✓ Generated random JWT Secret"

# Create temporary Secret file
cat > "$SECRET_TMP" << EOF
kind: Secret
apiVersion: v1
metadata:
  name: kubespark-secret
  namespace: kubespark
type: Opaque
stringData:
  DRONE_SERVER: http://172.31.0.88:30001
  DRONE_TOKEN: ???
  DRONE_YAML_SECRET: aKzfRGBgZVARtEIarLGHvicy1qjSe9zHXhivgcD3hcYktzbRC4pSGldyxhKa580d
  KUBESPARK_JWT_SECRET: "${KUBESPARK_JWT_SECRET}"
  KUBESPARK_PASSWORD: "${KUBESPARK_PASSWORD}"
  KUBESPARK_USERNAME: admin
EOF

echo "Applying Secret configuration..."
kubectl apply -f "$SECRET_TMP"

# Cleanup temporary file
rm "$SECRET_TMP"

# 4. Install KubeSpark core components
echo ""
echo "[4/6] Installing KubeSpark core components..."
kubectl apply -f "${SCRIPT_DIR}/kubespark.yaml"

# 5. Install Terminal component
echo ""
echo "[5/6] Installing Terminal component..."
kubectl apply -f "${SCRIPT_DIR}/kubespark-terminal.yaml"

# 6. Install Console component
echo ""
echo "[6/6] Installing Console component..."
kubectl apply -f "${SCRIPT_DIR}/kubespark-console.yaml"

# Install CRDs
echo ""
echo "=========================================="
echo "  Installing Custom Resource Definitions (CRDs)"
echo "=========================================="

for crd_file in "${SCRIPT_DIR}/crds"/*.yaml; do
    if [ -f "$crd_file" ]; then
        echo "Installing: $(basename "$crd_file")"
        kubectl apply -f "$crd_file"
    fi
done

echo ""
echo "=========================================="
echo "  ✓ Installation complete!"
echo "=========================================="
echo ""
echo "Admin account information:"
echo "  Username: admin"
echo "  Password: $KUBESPARK_PASSWORD"
echo ""

# Get current host IP
get_host_ip() {
    # Try different methods to get the host IP
    local ip=""
    
    # Method 1: hostname -I (Linux)
    if command -v hostname >/dev/null 2>&1; then
        ip=$(hostname -I | awk '{print $1}')
    fi
    
    # Method 2: ip route (Linux)
    if [ -z "$ip" ] && command -v ip >/dev/null 2>&1; then
        ip=$(ip route get 1 2>/dev/null | awk '{print $7}' | head -n1)
    fi
    
    # Method 3: ifconfig (older Linux)
    if [ -z "$ip" ] && command -v ifconfig >/dev/null 2>&1; then
        ip=$(ifconfig 2>/dev/null | grep 'inet ' | grep -v '127.0.0.1' | awk '{print $2}' | head -n1)
    fi
    
    # Method 4: default to localhost
    if [ -z "$ip" ]; then
        ip="127.0.0.1"
    fi
    
    echo "$ip"
}

HOST_IP=$(get_host_ip)

echo "Access KubeSpark Console at:"
echo "  http://${HOST_IP}:30000"
echo ""
echo "Check deployment status:"
echo "  kubectl get pods -n kubespark"
echo ""
echo "Check all resources:"
echo "  kubectl get all -n kubespark"
echo ""
echo "To install Drone CI/CD, run:"
echo "  ./install-drone-cicd.sh"
echo ""
