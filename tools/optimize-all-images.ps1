# Genera assets/images/opt/ (JPEG calidad web, borde largo max) y opt/c/ (tarjetas ~920px).
# Ejecutar desde la raíz del repo en Windows (PowerShell + System.Drawing).
$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$srcRoot = Join-Path $repoRoot "assets\images"
$optRoot = Join-Path $srcRoot "opt"
$optCardsRoot = Join-Path $optRoot "c"

if (-not (Test-Path $srcRoot)) {
  throw "No existe $srcRoot"
}

Add-Type -AssemblyName System.Drawing

function Save-JpegFromBitmap {
  param(
    [System.Drawing.Bitmap]$Bitmap,
    [string]$DestPath,
    [long]$Quality
  )
  $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
  $encParams = New-Object System.Drawing.Imaging.EncoderParameters 1
  $encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
    [System.Drawing.Imaging.Encoder]::Quality,
    $Quality
  )
  $dir = Split-Path -Parent $DestPath
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  if (Test-Path $DestPath) {
    Remove-Item $DestPath -Force
  }
  $Bitmap.Save($DestPath, $jpegCodec, $encParams)
}

function Export-JpegMaxLongEdge {
  param(
    [string]$SourcePath,
    [string]$DestPath,
    [int]$MaxLongEdge,
    [long]$Quality = 82
  )
  $src = [System.Drawing.Image]::FromFile($SourcePath)
  try {
    $longSide = [Math]::Max($src.Width, $src.Height)
    $ratio = if ($longSide -le $MaxLongEdge) { 1.0 } else { [double]$MaxLongEdge / [double]$longSide }
    $w = [int][Math]::Max(1, [Math]::Round($src.Width * $ratio))
    $h = [int][Math]::Max(1, [Math]::Round($src.Height * $ratio))
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, 0, 0, $w, $h)
    $g.Dispose()
    Save-JpegFromBitmap -Bitmap $bmp -DestPath $DestPath -Quality $Quality
    $bmp.Dispose()
  }
  finally {
    $src.Dispose()
  }
}

function Export-JpegMaxWidth {
  param(
    [string]$SourcePath,
    [string]$DestPath,
    [int]$MaxWidth,
    [long]$Quality = 82
  )
  $src = [System.Drawing.Image]::FromFile($SourcePath)
  try {
    $ratio = [double]$MaxWidth / [double]$src.Width
    if ($ratio -ge 1.0) {
      $w = $src.Width
      $h = $src.Height
    }
    else {
      $w = $MaxWidth
      $h = [int][Math]::Max(1, [Math]::Round($src.Height * $ratio))
    }
    $bmp = New-Object System.Drawing.Bitmap ([int]$w), ([int]$h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, 0, 0, [int]$w, [int]$h)
    $g.Dispose()
    Save-JpegFromBitmap -Bitmap $bmp -DestPath $DestPath -Quality $Quality
    $bmp.Dispose()
  }
  finally {
    $src.Dispose()
  }
}

# --- Logo pequeño ---
$logoSrc = Join-Path $srcRoot "logo_futur.jpeg"
if (Test-Path $logoSrc) {
  Write-Host "Logo -> opt\logo_futur.jpg"
  Export-JpegMaxWidth -SourcePath $logoSrc -DestPath (Join-Path $optRoot "logo_futur.jpg") -MaxWidth 160 -Quality 88
}

# --- Árbol principal: todo menos opt\ y residential-cards\ ---
$skipRx = [regex]'\\(opt|residential-cards)(\\|$)'
Get-ChildItem -Path $srcRoot -Recurse -File -Include *.png, *.jpg, *.jpeg |
  Where-Object {
    -not $skipRx.IsMatch($_.FullName) -and
    $_.Name -ne "logo_futur.jpeg"
  } |
  ForEach-Object {
    $rel = $_.FullName.Substring($srcRoot.Length + 1)
    $destRel = [regex]::Replace($rel, '\.(png|jpeg|jpg)$', '.jpg', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $dest = Join-Path $optRoot $destRel
    Write-Host "OPT $rel -> $destRel"
    $q = if ($destRel -match 'PLANO|plan|PLAN') { 88 } else { 82 }
    Export-JpegMaxLongEdge -SourcePath $_.FullName -DestPath $dest -MaxLongEdge 1920 -Quality $q
  }

# --- Tarjetas residential (920px) ---
$cardMap = @(
  @{ Out = "MODENA_CARD.jpg"; Try = @("monroe\01-DSC08361-1.jpg", "monroe\01-DSC08361-1.png") },
  @{ Out = "GRANADA_1.jpg"; Try = @("GRANADA_1.png") },
  @{ Out = "GRANADA_2.jpg"; Try = @("GRANADA_2.png") },
  @{ Out = "GRANADA_3.jpg"; Try = @("GRANADA_3.png") },
  @{ Out = "GRANADA_4.jpg"; Try = @("GRANADA_4.png") },
  @{ Out = "MERIDA_1.jpg"; Try = @("MERIDA_1.png") },
  @{ Out = "MERIDA_2.jpg"; Try = @("MERIDA_2.png") },
  @{ Out = "MERIDA_3.jpg"; Try = @("MERIDA_3.png") },
  @{ Out = "MERIDA_4.jpg"; Try = @("MERIDA_4.png") },
  @{ Out = "MERIDA_5.jpg"; Try = @("MERIDA_5.png") },
  @{ Out = "SEVILLA_1.jpg"; Try = @("SEVILLA_1.png") },
  @{ Out = "SEVILLA_2.jpg"; Try = @("SEVILLA_2.png") },
  @{ Out = "SEVILLA_3.jpg"; Try = @("SEVILLA_3.png") },
  @{ Out = "SEVILLA_4.jpg"; Try = @("SEVILLA_4.png") },
  @{ Out = "SEVILLA_5.jpg"; Try = @("SEVILLA_5.png") },
  @{ Out = "VALENCIA_1.jpg"; Try = @("VALENCIA_1.png") },
  @{ Out = "VALENCIA_2.jpg"; Try = @("VALENCIA_2.png") },
  @{ Out = "VALENCIA_3.jpg"; Try = @("VALENCIA_3.png") },
  @{ Out = "VALENCIA_4.jpg"; Try = @("VALENCIA_4.png") },
  @{ Out = "LANIN_1.jpg"; Try = @("LANIN_1.png") },
  @{ Out = "LANIN_2.jpg"; Try = @("LANIN_2.png") },
  @{ Out = "LANIN_3.jpg"; Try = @("LANIN_3.png") },
  @{ Out = "LANIN_4.jpg"; Try = @("LANIN_4.png") },
  @{ Out = "TOLEDO_1.jpg"; Try = @("TOLEDO_1.png") },
  @{ Out = "TOLEDO_2.jpg"; Try = @("TOLEDO_2.png") },
  @{ Out = "TOLEDO_3.jpg"; Try = @("TOLEDO_3.png") },
  @{ Out = "TOLEDO_4.jpg"; Try = @("TOLEDO_4.png") }
)

foreach ($row in $cardMap) {
  $found = $null
  foreach ($tryRel in $row.Try) {
    $p = Join-Path $srcRoot $tryRel
    if (Test-Path $p) {
      $found = $p
      break
    }
  }
  if (-not $found) {
    $fallback = Join-Path $srcRoot ("residential-cards\" + $row.Out)
    if (Test-Path $fallback) {
      $found = $fallback
    }
  }
  if ($found) {
    $dest = Join-Path $optCardsRoot $row.Out
    Write-Host "CARD $($row.Out) <- $found"
    Export-JpegMaxWidth -SourcePath $found -DestPath $dest -MaxWidth 920 -Quality 82
  }
  else {
    Write-Warning "Sin fuente para card $($row.Out)"
  }
}

# --- Tarjetas gateways index (920px): retail / industrial ---
$gatewayCardMap = @(
  @{ Out = "gateway_westplaza.jpg"; Try = @("westplazamall_1.jpeg", "westplazamall_1.jpg") },
  @{ Out = "gateway_industrial.jpg"; Try = @("industrial\industrial_1.png") }
)
foreach ($row in $gatewayCardMap) {
  $found = $null
  foreach ($tryRel in $row.Try) {
    $p = Join-Path $srcRoot $tryRel
    if (Test-Path $p) {
      $found = $p
      break
    }
  }
  if ($found) {
    $dest = Join-Path $optCardsRoot $row.Out
    Write-Host "GATEWAY $($row.Out) <- $found"
    Export-JpegMaxWidth -SourcePath $found -DestPath $dest -MaxWidth 920 -Quality 82
  }
  else {
    Write-Warning "Sin fuente para gateway $($row.Out)"
  }
}

# Si falta JPEG en opt\ raíz (ej. no hay PNG master), generar desde opt\c\
foreach ($row in $cardMap) {
  $base = $row.Out
  $fullOpt = Join-Path $optRoot $base
  if (-not (Test-Path $fullOpt)) {
    $cPath = Join-Path $optCardsRoot $base
    if (Test-Path $cPath) {
      Write-Host "Fallback opt\$base desde opt\c\$base"
      Export-JpegMaxLongEdge -SourcePath $cPath -DestPath $fullOpt -MaxLongEdge 1680 -Quality 82
    }
  }
}

Write-Host "Listo. Salida: $optRoot y $optCardsRoot"
