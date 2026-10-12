#!/usr/bin/env bash
# Run on the production server as root. Preserve client-certificate authentication.
set -eu

config=$(readlink -f /etc/nginx/sites-enabled/backoffice.boukirdiamond.com.conf)
test -f "$config"
pattern='^[[:space:]]*add_header[[:space:]]+Clear-Site-Data[[:space:]]+.*"cache".*always;[[:space:]]*$'
if ! grep -Eq "$pattern" "$config"; then
  echo 'No matching cache-clearing directive found; configuration unchanged.'
  exit 0
fi

backup="/etc/nginx/backoffice-cache-$(date +%Y%m%d-%H%M%S)-$$.bak"
cp -p "$config" "$backup"
echo "Backup: $backup"
sed -E -i "/$pattern/d" "$config"
if nginx -t; then
  systemctl reload nginx
  echo 'Cache-clearing directive removed; Nginx reloaded.'
else
  cp -p "$backup" "$config"
  echo 'Nginx validation failed; original configuration restored.' >&2
  exit 1
fi
