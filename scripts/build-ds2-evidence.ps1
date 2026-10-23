$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$evidence = Join-Path $PSScriptRoot '..\tests\e2e\evidence\ds-2'
$evidence = [System.IO.Path]::GetFullPath($evidence)

function Crop-Image {
  param([string]$Source, [string]$Target, [System.Drawing.Rectangle]$Rect)
  $sourceImage = [System.Drawing.Image]::FromFile($Source)
  try {
    $output = New-Object System.Drawing.Bitmap $Rect.Width, $Rect.Height
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($output)
      try { $graphics.DrawImage($sourceImage, 0, 0, $Rect, [System.Drawing.GraphicsUnit]::Pixel) }
      finally { $graphics.Dispose() }
      $output.Save($Target, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $output.Dispose() }
  } finally { $sourceImage.Dispose() }
}

$frameRect = New-Object System.Drawing.Rectangle 40, 50, 390, 844
Crop-Image (Join-Path $evidence 'figma-home-light-canvas.jpg') (Join-Path $evidence 'figma-home-filled.png') $frameRect
Crop-Image (Join-Path $evidence 'figma-home-empty-canvas.jpg') (Join-Path $evidence 'figma-home-empty.png') $frameRect
Crop-Image (Join-Path $evidence 'figma-home-dark-canvas.jpg') (Join-Path $evidence 'figma-home-dark.png') $frameRect

$overBandRaw = Join-Path $evidence 'figma-budget-over-raw.png'
Crop-Image (Join-Path $evidence 'figma-budget-band-set-canvas.jpg') $overBandRaw (New-Object System.Drawing.Rectangle 58, 228, 404, 154)
$base = [System.Drawing.Bitmap]::FromFile((Join-Path $evidence 'figma-home-filled.png'))
$band = [System.Drawing.Image]::FromFile($overBandRaw)
try {
  $over = New-Object System.Drawing.Bitmap 390, 844
  try {
    $g = [System.Drawing.Graphics]::FromImage($over)
    try {
      $g.DrawImage($base, 0, 0, 390, 844)
      $g.DrawImage($band, 0, 324, 390, 150)
    } finally { $g.Dispose() }
    $over.Save((Join-Path $evidence 'figma-home-over-budget.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  } finally { $over.Dispose() }
} finally { $band.Dispose(); $base.Dispose() }
Remove-Item -LiteralPath $overBandRaw

foreach ($state in @('filled', 'empty', 'over-budget', 'dark')) {
  $figma = [System.Drawing.Image]::FromFile((Join-Path $evidence "figma-home-$state.png"))
  $app = [System.Drawing.Image]::FromFile((Join-Path $evidence "app-home-$state.png"))
  try {
    $canvas = New-Object System.Drawing.Bitmap 800, 884
    try {
      $g = [System.Drawing.Graphics]::FromImage($canvas)
      try {
        $g.Clear([System.Drawing.Color]::White)
        $font = New-Object System.Drawing.Font 'Arial', 14, ([System.Drawing.FontStyle]::Bold)
        try {
          $g.DrawString('Figma reference', $font, [System.Drawing.Brushes]::Black, 8, 10)
          $g.DrawString('Built app - 390x844', $font, [System.Drawing.Brushes]::Black, 410, 10)
        } finally { $font.Dispose() }
        $g.DrawImage($figma, 0, 40, 390, 844)
        $g.DrawImage($app, 410, 40, 390, 844)
      } finally { $g.Dispose() }
      $canvas.Save((Join-Path $evidence "side-by-side-$state.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $canvas.Dispose() }
  } finally { $app.Dispose(); $figma.Dispose() }
}
