# Reuse the exact Figma frame rendered in the 2026-10-28 comparison (left 390 px)
# and pair it with the fresh 390x844 Playwright capture from this run (right).
Add-Type -AssemblyName System.Drawing
$folder = Split-Path -Parent $MyInvocation.MyCommand.Path
$prior = Join-Path (Split-Path -Parent $folder) 'c2-2026-10-28'
foreach ($kind in @('invest', 'divest')) {
  foreach ($part in @('top', 'bottom')) {
    $oldPair = [System.Drawing.Image]::FromFile((Join-Path $prior "pair-$kind-$part.jpg"))
    $app = [System.Drawing.Image]::FromFile((Join-Path $folder "app-$kind-$part.png"))
    try {
      if ($oldPair.Width -ne 780 -or $oldPair.Height -ne 844 -or $app.Width -ne 390 -or $app.Height -ne 844) {
        throw "Unexpected image dimensions for $kind $part"
      }
      $pair = [System.Drawing.Bitmap]::new(780, 844)
      try {
        $graphics = [System.Drawing.Graphics]::FromImage($pair)
        try {
          $graphics.DrawImage($oldPair, [System.Drawing.Rectangle]::new(0, 0, 390, 844), [System.Drawing.Rectangle]::new(0, 0, 390, 844), [System.Drawing.GraphicsUnit]::Pixel)
          $graphics.DrawImage($app, [System.Drawing.Rectangle]::new(390, 0, 390, 844), [System.Drawing.Rectangle]::new(0, 0, 390, 844), [System.Drawing.GraphicsUnit]::Pixel)
        } finally { $graphics.Dispose() }
        $pair.Save((Join-Path $folder "pair-$kind-$part.jpg"), [System.Drawing.Imaging.ImageFormat]::Jpeg)
      } finally { $pair.Dispose() }
    } finally { $app.Dispose(); $oldPair.Dispose() }
  }
}
