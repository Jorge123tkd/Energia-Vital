# Copy the encrypted 28/28 snapshot to a physically separate USB and restore-test it.
# No Cloudflare operations. Windows PowerShell 5.1, ASCII only.
param([Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z]$')][string]$Unidad)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dir=Join-Path $env:USERPROFILE 'Respaldos-Energia-Vital'
if(!(Test-Path -LiteralPath $dir -PathType Container)){throw 'No existe la carpeta privada de respaldos.'}
$files=@(Get-ChildItem -LiteralPath $dir -File -Filter 'bonaire-antes-029-034-*.evbackup' | Sort-Object LastWriteTimeUtc -Descending)
if($files.Count -lt 1){throw 'No existe copia cifrada 28/28 previa a 029-034.'}
$source=$files[0]
if($source.Length -lt 100){throw 'Respaldo cifrado demasiado pequeno.'}
$from=$source.FullName.Substring(0,1).ToUpperInvariant()
$to=$Unidad.ToUpperInvariant()
if($from -eq $to){throw 'Origen y destino usan la misma unidad.'}
try{
 $p1=Get-Partition -DriveLetter $from -ErrorAction Stop
 $p2=Get-Partition -DriveLetter $to -ErrorAction Stop
 $disk=Get-Disk -Number $p2.DiskNumber -ErrorAction Stop
}catch{throw 'No se pudo identificar el disco USB fisico.'}
if($p1.DiskNumber -eq $p2.DiskNumber -or $disk.BusType.ToString() -cne 'USB'){throw 'Destino rechazado: usa un disco USB fisico independiente.'}
$destRoot=('{0}:\' -f $to)
if(!(Test-Path $destRoot -PathType Container)){throw 'Unidad USB no disponible.'}
$folder=Join-Path $destRoot 'Bonaire-Respaldos-Cifrados'
New-Item -ItemType Directory -Path $folder -Force|Out-Null
$dest=Join-Path $folder $source.Name
if(Test-Path -LiteralPath $dest){throw 'El respaldo ya existe en USB; no sobrescribir.'}
Copy-Item -LiteralPath $source.FullName -Destination $dest -ErrorAction Stop
$h1=(Get-FileHash -LiteralPath $source.FullName -Algorithm SHA256).Hash
$h2=(Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash
if($h1 -cne $h2 -or (Get-Item -LiteralPath $dest).Length -ne $source.Length){throw 'La copia USB no coincide con el respaldo original.'}
Write-Host '[OK] USB fisico independiente y SHA256 coincidente.'
Write-Host '[VERIFICANDO] Restauracion del archivo guardado en USB; introduce la frase oculta.'
& node (Join-Path $root 'scripts/backup-bonaire-crypto.mjs') --verificar-28 $dest
if($LASTEXITCODE -ne 0){throw 'La restauracion desde USB fallo. No migrar.'}
Write-Host '[OK] Copia externa verificada: AES-256-GCM, SHA256 y SQLite 28/28.'
Write-Host '[OK] No se modificaron Cloudflare, D1, Worker, Pages ni R2.'
