#!/bin/bash
set -e

echo "=========================================="
echo "  KubeSpark Update Script"
echo "=========================================="

echo ""
echo "Restarting KubeSpark deployment..."
kubectl rollout restart deployment/kubespark -n kubespark

echo ""
echo "Restarting KubeSpark Console deployment..."
kubectl rollout restart deployment/kubespark-console -n kubespark

echo ""
echo "=========================================="
echo "  ✓ Update initiated!"
echo "=========================================="
echo ""
echo "Check rollout status:"
echo "  kubectl rollout status deployment/kubespark -n kubespark"
echo "  kubectl rollout status deployment/kubespark-console -n kubespark"
echo ""
echo "Check pod status:"
echo "  kubectl get pods -n kubespark"
echo ""
