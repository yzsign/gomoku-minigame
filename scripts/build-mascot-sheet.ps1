# 将单张 home-mascot.png 横向复制 N 份生成雪碧图（占位：各帧相同）；真实动画请用 GIF 拆帧后横向拼接替换。
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing
$base = Join-Path $PSScriptRoot "..\images\ui"
$src = Join-Path $base "home-mascot.png"
$dst = Join-Path $base "home-mascot-sheet.png"
$frames = 6
if (-not (Test-Path $src)) { throw "Missing $src" }
$img = [System.Drawing.Image]::FromFile((Resolve-Path $src))
try {
  $w = $img.Width
  $h = $img.Height
  $bmp = New-Object System.Drawing.Bitmap ($w * $frames), $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  for ($k = 0; $k -lt $frames; $k++) {
    $g.DrawImage($img, $k * $w, 0)
  }
  $g.Dispose()
  $bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "OK: $dst"
} finally {
  $img.Dispose()
}
