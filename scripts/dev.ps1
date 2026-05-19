# Use system Node.js (fixes terminals where Cursor's PATH hides npm)
$nodeDir = "C:\Program Files\nodejs"
if (-not (Test-Path "$nodeDir\node.exe")) {
  Write-Error "Install Node.js from https://nodejs.org/ (expected $nodeDir)"
  exit 1
}
$env:Path = "$nodeDir;" + ($env:Path -split ';' | Where-Object { $_ -notmatch 'cursor[\\/]resources[\\/]app[\\/]resources[\\/]helpers' }) -join ';'

Set-Location $PSScriptRoot\..

Write-Host "node: $(& `"$nodeDir\node.exe`" -v)"
Write-Host "npm:  $(& `"$nodeDir\npm.cmd`" -v)"
Write-Host "Starting dev server at http://localhost:3000`n"

& "$nodeDir\npm.cmd" run dev
