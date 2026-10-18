# Start the dev server through a local proxy (for networks where *.supabase.co is blocked).
# Usage: npm run dev:proxy
# Custom proxy port:
#   powershell -ExecutionPolicy Bypass -File scripts/dev-proxy.ps1 -Proxy "http://127.0.0.1:7890"
param(
  [string]$Proxy = "http://127.0.0.1:7897"
)

$env:HTTPS_PROXY = $Proxy
$env:HTTP_PROXY = $Proxy
$env:ALL_PROXY = $Proxy
$env:NO_PROXY = "localhost,127.0.0.1,::1"
# Node 20+ fetch ignores proxy env vars unless this flag is set
$env:NODE_USE_ENV_PROXY = "1"

Write-Host "[zhimy] starting dev server with proxy $Proxy" -ForegroundColor Cyan
& npm run dev
