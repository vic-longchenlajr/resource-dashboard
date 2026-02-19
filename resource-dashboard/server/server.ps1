# Resource Dashboard — Local HTTP Server
# No admin required. Serves static files on localhost.

param(
    [int]$Port = 4173,
    [string]$Root = (Join-Path $PSScriptRoot "..\app")
)

$Root = (Resolve-Path $Root).Path
$prefix = "http://localhost:$Port/"

# Check if port is already in use
$connection = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($connection) {
    Write-Host ""
    Write-Host "  Dashboard is already running on port $Port" -ForegroundColor Yellow
    Write-Host "  Opening browser..." -ForegroundColor Yellow
    Start-Process "http://localhost:$Port"
    Start-Sleep -Seconds 2
    exit
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Host ""
    Write-Host "  ERROR: Could not start server on port $Port" -ForegroundColor Red
    Write-Host "  $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Try a different port or close the application using port $Port" -ForegroundColor Yellow
    Read-Host "  Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "  ======================================" -ForegroundColor Cyan
Write-Host "    Resource Dashboard" -ForegroundColor Cyan
Write-Host "    Fire Suppression Technology" -ForegroundColor Cyan
Write-Host "  ======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Running at: http://localhost:$Port" -ForegroundColor Green
Write-Host "  Serving from: $Root" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Press Ctrl+C to stop the server." -ForegroundColor DarkGray
Write-Host ""

# Open browser
Start-Process "http://localhost:$Port"

# MIME type mapping
$mimeTypes = @{
    ".html" = "text/html"
    ".htm"  = "text/html"
    ".js"   = "application/javascript"
    ".mjs"  = "application/javascript"
    ".css"  = "text/css"
    ".json" = "application/json"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".woff" = "font/woff"
    ".woff2"= "font/woff2"
    ".ttf"  = "font/ttf"
    ".eot"  = "application/vnd.ms-fontobject"
    ".map"  = "application/json"
    ".txt"  = "text/plain"
    ".csv"  = "text/csv"
    ".pdf"  = "application/pdf"
}

# Request handling loop
while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = $request.Url.LocalPath
        if ($urlPath -eq "/") { $urlPath = "/index.html" }

        $filePath = Join-Path $Root ($urlPath.TrimStart("/").Replace("/", "\"))

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }

            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.StatusCode = 200
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            # SPA fallback: serve index.html for any unmatched route
            $indexPath = Join-Path $Root "index.html"
            if (Test-Path $indexPath) {
                $bytes = [System.IO.File]::ReadAllBytes($indexPath)
                $response.ContentType = "text/html"
                $response.ContentLength64 = $bytes.Length
                $response.StatusCode = 200
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } else {
                $response.StatusCode = 404
                $errorBytes = [System.Text.Encoding]::UTF8.GetBytes("Not Found")
                $response.OutputStream.Write($errorBytes, 0, $errorBytes.Length)
            }
        }

        $response.OutputStream.Close()
    }
    catch [System.Net.HttpListenerException] {
        break
    }
    catch {
        Write-Host "  Error: $_" -ForegroundColor Red
        if ($response) {
            try { $response.OutputStream.Close() } catch {}
        }
    }
}

$listener.Stop()
Write-Host ""
Write-Host "  Server stopped." -ForegroundColor Yellow
