# ==========================================================================
# tools/serve-fallback.ps1
# 兜底静态服务器：当电脑上既没有 node 也没有 python 时使用。
#
# 为什么不用 System.Net.HttpListener？
#   非提权进程没有 HTTP URL 保留（urlacl），HttpListener 会直接 "拒绝访问"。
#   所以这里用 TcpListener 自己实现一个最小 HTTP/1.1 服务器，普通权限就能跑，
#   而且可以监听 0.0.0.0，手机连同一个 Wi-Fi 也能访问。
#
# 用法：powershell -NoProfile -ExecutionPolicy Bypass -File tools\serve-fallback.ps1 -Port 8080
# ==========================================================================
param(
  [int]$Port = 8080
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root 'index.html'))) {
  Write-Host "找不到 index.html，请把本文件放在项目的 tools 目录里。" -ForegroundColor Red
  exit 1
}

$mime = @{
  '.html'        = 'text/html; charset=utf-8'
  '.htm'         = 'text/html; charset=utf-8'
  '.css'         = 'text/css; charset=utf-8'
  '.js'          = 'application/javascript; charset=utf-8'
  '.mjs'         = 'application/javascript; charset=utf-8'
  '.json'        = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json; charset=utf-8'
  '.svg'         = 'image/svg+xml'
  '.png'         = 'image/png'
  '.jpg'         = 'image/jpeg'
  '.jpeg'        = 'image/jpeg'
  '.webp'        = 'image/webp'
  '.ico'         = 'image/x-icon'
  '.md'          = 'text/plain; charset=utf-8'
  '.txt'         = 'text/plain; charset=utf-8'
}

function Send-Response {
  param($Stream, [int]$Status, [string]$StatusText, [string]$ContentType, [byte[]]$Body)
  if ($null -eq $Body) { $Body = New-Object byte[] 0 }
  $head = "HTTP/1.1 $Status $StatusText`r`n" +
          "Content-Type: $ContentType`r`n" +
          "Content-Length: $($Body.Length)`r`n" +
          "Cache-Control: no-cache`r`n" +
          "Connection: close`r`n`r`n"
  $headBytes = [System.Text.Encoding]::ASCII.GetBytes($head)
  $Stream.Write($headBytes, 0, $headBytes.Length)
  if ($Body.Length -gt 0) { $Stream.Write($Body, 0, $Body.Length) }
  $Stream.Flush()
}

function Get-LanAddresses {
  $out = @()
  foreach ($nic in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
    if ($nic.OperationalStatus -ne 'Up') { continue }
    if ($nic.NetworkInterfaceType -eq 'Loopback') { continue }
    foreach ($ua in $nic.GetIPProperties().UnicastAddresses) {
      if ($ua.Address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork) {
        $out += $ua.Address.ToString()
      }
    }
  }
  return $out
}

$listener = $null
try {
  $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $Port)
  $listener.Start()
}
catch {
  Write-Host ""
  Write-Host "端口 $Port 启动失败：$($_.Exception.Message)" -ForegroundColor Red
  Write-Host "换个端口再试，例如把 bat 里的 PORT 改成 8081。" -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "  本地预览已启动（PowerShell 兜底方式，不需要 node / python）"
Write-Host ""
Write-Host "  电脑打开：  http://localhost:$Port/index.html"
$lan = Get-LanAddresses
if ($lan.Count -gt 0) {
  Write-Host "  手机打开（同一个 Wi-Fi）："
  foreach ($ip in $lan) { Write-Host "              http://${ip}:$Port/index.html" }
}
Write-Host ""
Write-Host "  如果 Windows 弹出防火墙提示，请点「允许访问」，否则手机连不上。"
Write-Host "  按 Ctrl+C 停止。"
Write-Host ""

while ($true) {
  $client = $null
  try {
    $client = $listener.AcceptTcpClient()
  }
  catch {
    Start-Sleep -Milliseconds 50
    continue
  }

  try {
    $client.ReceiveTimeout = 5000
    $stream = $client.GetStream()

    # 只读请求行和头，用一个字节一个字节读的方式，避免缓冲吞掉后续数据
    $buffer = New-Object System.Collections.Generic.List[byte]
    $stream.ReadTimeout = 5000
    $prev = -1
    while ($true) {
      $b = $stream.ReadByte()
      if ($b -lt 0) { break }
      $buffer.Add([byte]$b)
      if ($prev -eq 13 -and $b -eq 10) {
        # 连续两个 CRLF 表示头部结束
        $n = $buffer.Count
        if ($n -ge 4 -and $buffer[$n - 4] -eq 13 -and $buffer[$n - 3] -eq 10) { break }
      }
      $prev = $b
      if ($buffer.Count -gt 16384) { break }
    }

    $headText = [System.Text.Encoding]::ASCII.GetString($buffer.ToArray())
    $firstLine = ($headText -split "`r`n")[0]
    if ([string]::IsNullOrWhiteSpace($firstLine)) { continue }

    $parts = $firstLine.Split(' ')
    if ($parts.Length -lt 2) { continue }

    $rawPath = $parts[1]
    $qIndex = $rawPath.IndexOf('?')
    if ($qIndex -ge 0) { $rawPath = $rawPath.Substring(0, $qIndex) }

    $path = [System.Uri]::UnescapeDataString($rawPath)
    if ([string]::IsNullOrEmpty($path) -or $path -eq '/') { $path = '/index.html' }

    $candidate = [System.IO.Path]::GetFullPath((Join-Path $root $path.TrimStart('/')))
    if (-not $candidate.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
      Send-Response -Stream $stream -Status 403 -StatusText 'Forbidden' -ContentType 'text/plain; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes('403'))
      continue
    }

    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($candidate).ToLowerInvariant()
      $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
      $bytes = [System.IO.File]::ReadAllBytes($candidate)
      Send-Response -Stream $stream -Status 200 -StatusText 'OK' -ContentType $type -Body $bytes
    }
    else {
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404 找不到：$path")
      Send-Response -Stream $stream -Status 404 -StatusText 'Not Found' -ContentType 'text/plain; charset=utf-8' -Body $msg
    }
  }
  catch {
    # 单个请求出错不影响服务，继续处理下一个
  }
  finally {
    if ($client) { try { $client.Close() } catch { } }
  }
}
