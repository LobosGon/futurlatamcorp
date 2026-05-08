# OBSOLETO: usar optimize-all-images.ps1 (genera opt\ + opt\c\ para todo el sitio).
# Genera JPEG ligeros (~920px) para tarjetas Residential (Windows PowerShell + System.Drawing).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root "assets\images"))) {
  throw "No se encuentra assets\images bajo $root"
}
$srcDir = Join-Path $root "assets\images"
$outDir = Join-Path $srcDir "residential-cards"
if (-not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir | Out-Null
}

Add-Type -AssemblyName System.Drawing

function Save-JpegMaxWidth {
  param(
    [string]$SourcePath,
    [string]$DestPath,
    [int]$MaxWidth = 920,
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
      $h = [int][Math]::Round($src.Height * $ratio)
    }
    $bmp = New-Object System.Drawing.Bitmap ([int]$w), ([int]$h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($src, 0, 0, [int]$w, [int]$h)
    $g.Dispose()

    $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
    $encParams = New-Object System.Drawing.Imaging.EncoderParameters 1
    $encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
      [System.Drawing.Imaging.Encoder]::Quality,
      $Quality
    )
    if (Test-Path $DestPath) {
      Remove-Item $DestPath -Force
    }
    $bmp.Save($DestPath, $jpegCodec, $encParams)
    $bmp.Dispose()
  }
  finally {
    $src.Dispose()
  }
}

$sources = @(
  @{ Rel = "GRANADA_1.png"; Out = "GRANADA_1.jpg" },
  @{ Rel = "GRANADA_2.png"; Out = "GRANADA_2.jpg" },
  @{ Rel = "GRANADA_3.png"; Out = "GRANADA_3.jpg" },
  @{ Rel = "GRANADA_4.png"; Out = "GRANADA_4.jpg" },
  @{ Rel = "MERIDA_1.png"; Out = "MERIDA_1.jpg" },
  @{ Rel = "MERIDA_2.png"; Out = "MERIDA_2.jpg" },
  @{ Rel = "MERIDA_3.png"; Out = "MERIDA_3.jpg" },
  @{ Rel = "MERIDA_4.png"; Out = "MERIDA_4.jpg" },
  @{ Rel = "MERIDA_5.png"; Out = "MERIDA_5.jpg" },
  @{ Rel = "SEVILLA_1.png"; Out = "SEVILLA_1.jpg" },
  @{ Rel = "SEVILLA_2.png"; Out = "SEVILLA_2.jpg" },
  @{ Rel = "SEVILLA_3.png"; Out = "SEVILLA_3.jpg" },
  @{ Rel = "SEVILLA_4.png"; Out = "SEVILLA_4.jpg" },
  @{ Rel = "SEVILLA_5.png"; Out = "SEVILLA_5.jpg" },
  @{ Rel = "VALENCIA_1.png"; Out = "VALENCIA_1.jpg" },
  @{ Rel = "VALENCIA_2.png"; Out = "VALENCIA_2.jpg" },
  @{ Rel = "VALENCIA_3.png"; Out = "VALENCIA_3.jpg" },
  @{ Rel = "VALENCIA_4.png"; Out = "VALENCIA_4.jpg" },
  @{ Rel = "LANIN_1.png"; Out = "LANIN_1.jpg" },
  @{ Rel = "LANIN_2.png"; Out = "LANIN_2.jpg" },
  @{ Rel = "LANIN_3.png"; Out = "LANIN_3.jpg" },
  @{ Rel = "LANIN_4.png"; Out = "LANIN_4.jpg" },
  @{ Rel = "TOLEDO_1.png"; Out = "TOLEDO_1.jpg" },
  @{ Rel = "TOLEDO_2.png"; Out = "TOLEDO_2.jpg" },
  @{ Rel = "TOLEDO_3.png"; Out = "TOLEDO_3.jpg" },
  @{ Rel = "TOLEDO_4.png"; Out = "TOLEDO_4.jpg" },
  @{ Rel = "monroe\01-DSC08361-1.jpg"; Out = "MODENA_CARD.jpg" }
)

foreach ($item in $sources) {
  $inPath = Join-Path $srcDir $item.Rel
  $outPath = Join-Path $outDir $item.Out
  if (-not (Test-Path $inPath)) {
    Write-Warning "Omitido (no existe): $($item.Rel)"
    continue
  }
  Write-Host "OK $($item.Rel) -> $($item.Out)"
  Save-JpegMaxWidth -SourcePath $inPath -DestPath $outPath -MaxWidth 920 -Quality 82
}

Write-Host "Listo: $outDir"
