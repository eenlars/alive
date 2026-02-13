#!/bin/bash
set -e

echo "Stopping Redis..."
systemctl stop redis-server
echo "OK: Redis stopped"
