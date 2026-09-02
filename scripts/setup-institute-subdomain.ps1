param(
  [string]$Subdomain = "nexusitacad",
  [string]$Zone = "niyamstack.com",
  [string]$ServerIp = "51.79.167.187",
  [string]$SshUser = "ubuntu",
  [string]$PropelRoot = "/var/www/propel.niyamstack.com",
  [int]$ApiPort = 8080,
  [string]$OrgSlug = "nexusitacad",
  [switch]$SkipDns,
  [switch]$SkipVps
)

$ErrorActionPreference = "Stop"
$HostName = "$Subdomain.$Zone"
$SshTarget = "$SshUser@$ServerIp"

function Write-Step([string]$Text) {
  Write-Host ""
  Write-Host "== $Text ==" -ForegroundColor Cyan
}

Write-Step "Target: https://$HostName -> $ServerIp"

Write-Step "1) DNS check"
try {
  $dns = Resolve-DnsName $HostName -Type A -ErrorAction Stop
  $ip = ($dns | Where-Object { $_.IPAddress } | Select-Object -First 1).IPAddress
  if ($ip -eq $ServerIp) {
    Write-Host "DNS OK: $HostName -> $ip" -ForegroundColor Green
  } else {
    Write-Host "DNS exists but points to $ip (expected $ServerIp)" -ForegroundColor Yellow
  }
} catch {
  Write-Host "DNS missing for $HostName" -ForegroundColor Yellow
  if (-not $SkipDns) {
    $appKey = $env:OVH_APPLICATION_KEY
    $appSecret = $env:OVH_APPLICATION_SECRET
    $consumerKey = $env:OVH_CONSUMER_KEY
    if ($appKey -and $appSecret -and $consumerKey) {
      Write-Host "Creating OVH A record via API..."
      $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
      $body = @{
        fieldType = "A"
        subDomain = $Subdomain
        target    = $ServerIp
        ttl       = 3600
      } | ConvertTo-Json -Compress
      $url = "https://eu.api.ovh.com/1.0/domain/zone/$Zone/record"
      $signature = "$appSecret+$consumerKey+POST+$url+$body+$timestamp"
      $sha = [System.Security.Cryptography.SHA1]::Create()
      $hash = -join ($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($signature)) | ForEach-Object { $_.ToString("x2") })
      $headers = @{
        "X-Ovh-Application" = $appKey
        "X-Ovh-Consumer"    = $consumerKey
        "X-Ovh-Timestamp"   = "$timestamp"
        "X-Ovh-Signature"   = "`$1`$$hash"
        "Content-Type"      = "application/json"
      }
      Invoke-RestMethod -Method Post -Uri $url -Headers $headers -Body $body | Out-Null
      Invoke-RestMethod -Method Post -Uri "https://eu.api.ovh.com/1.0/domain/zone/$Zone/refresh" -Headers $headers | Out-Null
      Write-Host "OVH record created. Waiting 30s for propagation..." -ForegroundColor Green
      Start-Sleep -Seconds 30
    } else {
      Write-Host @"

Add this DNS record manually (OVH panel -> Domain -> $Zone -> DNS zone):
  Type: A
  Subdomain: $Subdomain
  Target: $ServerIp
  TTL: 3600

Then run this script again with -SkipDns once DNS resolves.
"@
      exit 1
    }
  }
}

if ($SkipVps) {
  Write-Host "Skipping VPS setup (-SkipVps)." -ForegroundColor Yellow
  exit 0
}

Write-Step "2) VPS nginx + SSL + org mapping"
$remote = @"
set -euo pipefail
HOST='$HostName'
ROOT='$PropelRoot'
PORT='$ApiPort'
SLUG='$OrgSlug'
SITE='/etc/nginx/sites-available/'"\$HOST"
ENABLED='/etc/nginx/sites-enabled/'"\$HOST"

sudo test -d "\$ROOT/frontend/dist"

sudo tee "\$SITE" >/dev/null <<EOF
server {
  listen 80;
  server_name \$HOST;
  root \$ROOT/frontend/dist;
  index index.html;

  location /api/ {
    proxy_pass http://127.0.0.1:\$PORT;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }

  location / {
    try_files \$uri \$uri/ /index.html;
  }
}
EOF

sudo ln -sf "\$SITE" "\$ENABLED"
sudo nginx -t
sudo systemctl reload nginx

if ! sudo test -f "/etc/letsencrypt/live/\$HOST/fullchain.pem"; then
  sudo certbot --nginx -d "\$HOST" --non-interactive --agree-tos -m support@niyamstack.com --redirect || true
fi

cd "\$ROOT"
git fetch origin
git checkout testing
git pull --ff-only origin testing
cd frontend && npm ci && npm run build && cd ..
sudo systemctl restart propel
sleep 35

sudo docker compose -p propel exec -T postgres psql -U propel -d propel_prod -c \
  "UPDATE organizations SET custom_domain = '\$HOST', website_url = 'https://\$HOST', website_published = true WHERE lower(slug) = lower('\$SLUG');"

echo '==== CHECKS ===='
curl -sS "http://127.0.0.1:\$PORT/actuator/health" || true
echo
curl -sI "https://\$HOST" | head -5 || true
curl -sS "https://\$HOST/api/public/sites/by-host?host=\$HOST" || true
echo
"@

ssh $SshTarget $remote

Write-Step "Done"
Write-Host "Open: https://$HostName"
Write-Host "If you still see the admin login, hard-refresh (Ctrl+F5)."
