# Bonaire: copy an ALREADY encrypted D1 backup to a separate USB disk, and verify it.
# No remote/cloud operations. Compatible with Windows PowerShell 5.1. ASCII only.
param([Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z]$')][string]$Unidad)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$dir=Join-Path $env:USERPROFILE 'Respaldos-Energia-Vital'
if(!(Test-Path $dir -PathType Container)){throw 'No existe carpeta privada de respaldos.'}
$files=@(Get-ChildItem -LiteralPath $dir -File -Filter 'bonaire-antes-025-028-*.evbackup' |
 Sort-Object LastWriteTimeUtc -Descending)
if($files.Count -lt 1){throw 'No existe un respaldo cifrado previo a 025-028.'}
$source=$files[0]
if($source.Length -lt 100){throw 'Archivo de respaldo demasiado pequeno.'}
$from=$source.FullName.Substring(0,1).ToUpperInvariant()
$to=$Unidad.ToUpperInvariant()
if($from -eq $to){throw 'Origen y destino usan la misma letra de disco.'}
try {
 $p1=Get-Partition -DriveLetter $from -ErrorAction Stop
 $p2=Get-Partition -DriveLetter $to -ErrorAction Stop
 $disk=Get-Disk -Number $p2.DiskNumber -ErrorAction Stop
} catch {throw 'No se pudo identificar una unidad USB fisica con letra asignada.'}
if($p1.DiskNumber -eq $p2.DiskNumber -or $disk.BusType.ToString() -cne 'USB'){
 throw 'Destino rechazado: debe ser una unidad USB en otro disco fisico.'
}
$destRoot=('{0}:\' -f $to)
if(!(Test-Path $destRoot -PathType Container)){throw 'Unidad USB no disponible.'}
$folder=Join-Path $destRoot 'Bonaire-Respaldos-Cifrados'
New-Item -ItemType Directory -Path $folder -Force|Out-Null
$dest=Join-Path $folder $source.Name
if(Test-Path -LiteralPath $dest){throw 'El archivo ya existe en USB. No sobrescribir.'}
Copy-Item -LiteralPath $source.FullName -Destination $dest -ErrorAction Stop
$h1=(Get-FileHash -LiteralPath $source.FullName -Algorithm SHA256).Hash
$h2=(Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash
if($h1 -cne $h2 -or (Get-Item -LiteralPath $dest).Length -ne $source.Length){
 throw 'La copia USB no coincide con la original cifrada. No migrar.'
}
Write-Host '[OK] USB en disco fisico independiente, copia cifrada e integridad SHA-256 coincidente.'
Write-Host "SHA256 externo: $h2"
Write-Host '[VERIFICANDO] Restauracion interna del archivo almacenado en el USB; introducir frase oculta.'
& node (Join-Path $root 'scripts/backup-bonaire-crypto.mjs') --verificar $dest
if($LASTEXITCODE -ne 0){throw 'La restauracion desde USB fallo. No migrar.'}
Write-Host '[OK] Copia EXTERNA: SHA-256 identico y restauracion 24/24 correcta.'
Write-Host '[OK] No se modificaron Cloudflare, D1 ni Pages. Guardar el USB desconectado.'
