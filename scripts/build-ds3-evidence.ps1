$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$evidence = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\tests\e2e\evidence\ds-3'))

function Crop-And-Resize {
  param(
    [string]$Source,
    [string]$Target,
    [System.Drawing.Rectangle]$Rect
  )
  $sourceImage = [System.Drawing.Image]::FromFile($Source)
  try {
    $output = New-Object System.Drawing.Bitmap 390, 844
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($output)
      try {
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.DrawImage(
          $sourceImage,
          (New-Object System.Drawing.Rectangle 0, 0, 390, 844),
          $Rect,
          [System.Drawing.GraphicsUnit]::Pixel
        )
      } finally { $graphics.Dispose() }
      $output.Save($Target, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $output.Dispose() }
  } finally { $sourceImage.Dispose() }
}

# Figma is at 46–47% zoom in the captured editor. These rectangles are the
# first 844 design pixels of each 390px frame, matching the app screenshots.
Crop-And-Resize `
  (Join-Path $evidence 'figma-manual-add-canvas.jpg') `
  (Join-Path $evidence 'figma-manual-add.png') `
  (New-Object System.Drawing.Rectangle 336, 48, 184, 397)
Crop-And-Resize `
  (Join-Path $evidence 'figma-slip-confirm-canvas.jpg') `
  (Join-Path $evidence 'figma-slip-confirm.png') `
  (New-Object System.Drawing.Rectangle 336, 78, 184, 397)

foreach ($state in @('manual-add', 'slip-confirm')) {
  $figma = [System.Drawing.Image]::FromFile((Join-Path $evidence "figma-$state.png"))
  $app = [System.Drawing.Image]::FromFile((Join-Path $evidence "app-$state.png"))
  try {
    $canvas = New-Object System.Drawing.Bitmap 800, 884
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($canvas)
      try {
        $graphics.Clear([System.Drawing.Color]::White)
        $font = New-Object System.Drawing.Font 'Arial', 14, ([System.Drawing.FontStyle]::Bold)
        try {
          $graphics.DrawString('Figma reference - top 390x844', $font, [System.Drawing.Brushes]::Black, 8, 10)
          $graphics.DrawString('Built app - 390x844', $font, [System.Drawing.Brushes]::Black, 410, 10)
        } finally { $font.Dispose() }
        $graphics.DrawImage($figma, 0, 40, 390, 844)
        $graphics.DrawImage($app, 410, 40, 390, 844)
      } finally { $graphics.Dispose() }
      $canvas.Save((Join-Path $evidence "side-by-side-$state.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $canvas.Dispose() }
  } finally { $app.Dispose(); $figma.Dispose() }
}
