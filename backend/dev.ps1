<#
.SYNOPSIS
  Manage the MedAssist backend dev server without orphaning uvicorn workers.

.DESCRIPTION
  On Windows, `uvicorn --reload` does not run as a single process. It starts a
  parent reloader (which owns the listening socket) plus a `multiprocessing`
  child that actually serves requests. Two consequences bite during
  development:

    1. Stopping the parent (by PID, or via Ctrl+C on the wrong console) leaves
       the child running as an orphan. It keeps the port bound and keeps
       serving the OLD code, so endpoint changes appear to be ignored and two
       "servers" fight over one port.

    2. Starting a second instance while the port is busy produces another
       orphan instead of an error.

  This script always kills the whole process tree (`taskkill /T`), waits for
  the port to actually be released, and refuses to start on an occupied port.
  That makes `stop` reliable and makes a stale worker impossible to miss.

.PARAMETER Action
  start | stop | restart | status

.PARAMETER Port
  Port to manage. Defaults to 8000.

.PARAMETER NoReload
  Skip --reload (single process, no child worker).

.EXAMPLE
  .\dev.ps1 status
  .\dev.ps1 restart
  .\dev.ps1 stop
  .\dev.ps1 start -Port 8010 -NoReload
#>
[CmdletBinding()]
param(
  [ValidateSet('start', 'stop', 'restart', 'status')]
  [string]$Action = 'status',

  [int]$Port = 8000,

  [switch]$NoReload
)

$ErrorActionPreference = 'Stop'
$BackendDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $BackendDir

# -- Helpers ---------------------------------------------------------------

# The uvicorn *root* processes only. The reloader's worker is a
# `multiprocessing.spawn` child whose command line is `-c "from
# multiprocessing.spawn import spawn_main..."`, so matching on
# `uvicorn\s+main:app` deliberately excludes it. We want the root so
# taskkill /T can take the whole tree down together.
function Get-UvicornRoots {
  @(Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -match 'uvicorn\s+main:app' })
}

function Get-PortOwner([int]$PortNumber) {
  $conn = Get-NetTCPConnection -LocalPort $PortNumber -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($conn) { return $conn.OwningProcess }
  return $null
}

function Get-DescribePid([int]$ProcessId) {
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$ProcessId" -ErrorAction SilentlyContinue
  if (-not $p) { return "<process no longer exists>" }
  $cmd = $p.CommandLine
  if ($cmd -and $cmd.Length -gt 110) { $cmd = $cmd.Substring(0, 110) + '...' }
  return "PID $($p.ProcessId) (parent $($p.ParentProcessId)): $cmd"
}

function Wait-PortFree([int]$PortNumber, [int]$TimeoutSeconds = 12) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (-not (Get-PortOwner $PortNumber)) { return $true }
    Start-Sleep -Milliseconds 250
  }
  return $false
}

# -- Actions ---------------------------------------------------------------

function Invoke-StopServers {
  # Wrap in @() at the call site: PowerShell unrolls a one-element array on
  # return, and a bare CIM object has no .Count, which silently breaks the
  # empty check.
  $roots = @(Get-UvicornRoots)
  if ($roots.Count -eq 0) {
    Write-Host "No running uvicorn server found." -ForegroundColor Yellow
  }
  else {
    foreach ($root in $roots) {
      Write-Host "Stopping uvicorn tree rooted at PID $($root.ProcessId) (and its reload worker)..." -ForegroundColor Cyan
      # /T is the important part: it also kills the multiprocessing child.
      & taskkill /PID $root.ProcessId /T /F 2>&1 | Out-Null
    }
  }

  # Killing the parent can leave the socket in the kernel's table briefly, and
  # an orphaned worker would still be holding it. Wait it out. Both the default
  # port and the requested one are checked, since a stray server on 8000 is the
  # usual reason a fresh start silently hits stale code.
  $portsToCheck = @(8000, $Port) | Select-Object -Unique
  foreach ($p in $portsToCheck) {
    if (Wait-PortFree $p) {
      Write-Host "Port $p is free." -ForegroundColor DarkGray
    }
    else {
      $owner = Get-PortOwner $p
      Write-Warning "Port $p is STILL bound by $(Get-DescribePid $owner). An orphan survived - run this again, or close the terminal that started it."
    }
  }
}

function Invoke-StartServer {
  $owner = Get-PortOwner $Port
  if ($owner) {
    Write-Host "Port $Port is already in use." -ForegroundColor Red
    Write-Host "  $(Get-DescribePid $owner)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Refusing to start a second instance - that is what creates orphans." -ForegroundColor Yellow
    Write-Host "  Run '.\dev.ps1 stop' first, or choose another port: .\dev.ps1 start -Port 8010" -ForegroundColor Yellow
    exit 1
  }

  $uvArgs = @('main:app', '--host', '127.0.0.1', '--port', "$Port")
  if (-not $NoReload) {
    $uvArgs += @('--reload', '--reload-dir', $BackendDir)
  }

  Write-Host "Starting backend on http://127.0.0.1:$Port  (reload: $(-not $NoReload))" -ForegroundColor Green
  Write-Host "Press Ctrl+C to stop cleanly - Ctrl+C shuts down the whole tree, which is why this is preferred over killing the PID." -ForegroundColor DarkGray
  Write-Host ""

  & python -m uvicorn @uvArgs
}

function Invoke-ShowStatus {
  Write-Host "=== Backend dev-server status ===" -ForegroundColor Cyan
  Write-Host ""

  $roots = @(Get-UvicornRoots)
  if ($roots.Count -eq 0) {
    Write-Host "uvicorn processes : none" -ForegroundColor Yellow
  }
  else {
    Write-Host "uvicorn processes : $($roots.Count) root(s)" -ForegroundColor $(if ($roots.Count -gt 1) { 'Yellow' } else { 'Green' })
    foreach ($root in $roots) {
      Write-Host "  $(Get-DescribePid $root.ProcessId)"
      # Surface reload children so an orphaned worker is obvious.
      $children = @(Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.ParentProcessId -eq $root.ProcessId })
      foreach ($child in $children) {
        Write-Host "      worker PID $($child.ProcessId)" -ForegroundColor DarkGray
      }
    }
    if ($roots.Count -gt 1) {
      Write-Host ""
      Write-Host "More than one uvicorn root is running. Anything but the one you intend is leftover clutter." -ForegroundColor Yellow
      Write-Host "  Run '.\dev.ps1 stop' to clear them all." -ForegroundColor Yellow
    }
  }

  Write-Host ""
  $owner = Get-PortOwner $Port
  if ($owner) {
    Write-Host "port $Port        : LISTENING (PID $owner)" -ForegroundColor Green
  }
  else {
    Write-Host "port $Port        : free" -ForegroundColor DarkGray
  }
}

# -- Dispatch --------------------------------------------------------------

switch ($Action) {
  'start'   { Invoke-StartServer }
  'stop'    { Invoke-StopServers }
  'restart' { Invoke-StopServers; Write-Host ""; Invoke-StartServer }
  'status'  { Invoke-ShowStatus }
}