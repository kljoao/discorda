$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$taskRoot=Split-Path $PSScriptRoot -Parent
$dest=Join-Path $taskRoot 'apps/desktop/resources'
function Rounded($x,$y,$w,$h,$r){
 $p=[Drawing.Drawing2D.GraphicsPath]::new()
 $p.AddArc($x,$y,$r*2,$r*2,180,90);$p.AddArc($x+$w-$r*2,$y,$r*2,$r*2,270,90)
 $p.AddArc($x+$w-$r*2,$y+$h-$r*2,$r*2,$r*2,0,90);$p.AddArc($x,$y+$h-$r*2,$r*2,$r*2,90,90);$p.CloseFigure();return $p
}
$images=@()
foreach($size in @(16,24,32,48,64,128,256)){
 $bmp=[Drawing.Bitmap]::new($size,$size);$g=[Drawing.Graphics]::FromImage($bmp)
 $g.SmoothingMode=[Drawing.Drawing2D.SmoothingMode]::AntiAlias
 $g.ScaleTransform($size/256.0,$size/256.0)
 $g.Clear([Drawing.Color]::Transparent)
 $back=[Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#20202b'))
 $bubble=[Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#9caafb'))
 $light=[Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#20202b'),12)
 $light.StartCap='Round';$light.EndCap='Round'
 $path=Rounded 0 0 256 256 54;$g.FillPath($back,$path);$path.Dispose()
 $path=Rounded 42 48 172 142 45;$g.FillPath($bubble,$path);$path.Dispose()
 $tail=[Drawing.PointF[]]@([Drawing.PointF]::new(65,162),[Drawing.PointF]::new(65,213),[Drawing.PointF]::new(116,178));$g.FillPolygon($bubble,$tail)
 $g.DrawLine($light,89,109,89,137);$g.DrawLine($light,115,91,115,155);$g.DrawLine($light,141,100,141,146);$g.DrawLine($light,167,112,167,134)
 $stream=[IO.MemoryStream]::new();$bmp.Save($stream,[Drawing.Imaging.ImageFormat]::Png)
 $images+=,@{Size=$size;Bytes=$stream.ToArray()}
 if($size -eq 256){[IO.File]::WriteAllBytes((Join-Path $dest 'icon.png'),$stream.ToArray())}
 $stream.Dispose();$light.Dispose();$back.Dispose();$bubble.Dispose();$g.Dispose();$bmp.Dispose()
}
$out=[IO.File]::Create((Join-Path $dest 'icon.ico'));$writer=[IO.BinaryWriter]::new($out)
$writer.Write([uint16]0);$writer.Write([uint16]1);$writer.Write([uint16]$images.Count)
$offset=6+16*$images.Count
foreach($entry in $images){$dim=if($entry.Size -eq 256){0}else{$entry.Size};$writer.Write([byte]$dim);$writer.Write([byte]$dim);$writer.Write([byte]0);$writer.Write([byte]0);$writer.Write([uint16]1);$writer.Write([uint16]32);$writer.Write([uint32]$entry.Bytes.Length);$writer.Write([uint32]$offset);$offset+=$entry.Bytes.Length}
foreach($entry in $images){$writer.Write([byte[]]$entry.Bytes)}
$writer.Dispose();$out.Dispose()
