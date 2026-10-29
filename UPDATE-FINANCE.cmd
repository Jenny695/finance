@echo off
setlocal
cd /d "%~dp0"
set "FINANCE_UPDATE_LAUNCHER=%~f0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$content=Get-Content -LiteralPath $env:FINANCE_UPDATE_LAUNCHER -Raw -Encoding UTF8; $code=($content -split '(?m)^# FINANCE_UPDATE_POWERSHELL\r?$',2)[1]; & ([scriptblock]::Create($code))"
if errorlevel 1 pause
exit /b
# FINANCE_UPDATE_POWERSHELL
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $env:FINANCE_UPDATE_LAUNCHER
Set-Location -LiteralPath $taskRoot
$taskTemp=$null
try {
 if(!(Test-Path -LiteralPath '.env') -or !(Test-Path -LiteralPath 'package.json')){throw 'Please copy UPDATE-FINANCE.cmd into your ORIGINAL project folder (beside .env and package.json), then run it there.'}
 $package=Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json
 if($package.name -ne 'finance-insight-prototype'){throw 'This is not the finance project folder.'}
 & node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=12)?0:1)"
 if($LASTEXITCODE -ne 0){throw 'Please install Node.js 24 LTS first.'}
 Write-Host 'Close only the WEBSITE server with Ctrl+C. Keep Cloudflare running.' -ForegroundColor Yellow
 Read-Host 'Press Enter when the old website server has stopped' | Out-Null
 $taskPortBusy=$false
 $taskProbe=New-Object Net.Sockets.TcpClient
 try{$taskProbe.Connect('127.0.0.1',3000);$taskPortBusy=$true}catch{}finally{$taskProbe.Dispose()}
 if($taskPortBusy){throw 'Port 3000 is still running. Stop the OLD website server with Ctrl+C, then run this updater again. Do not stop Cloudflare.'}
 $taskOrigin=(& node --env-file-if-exists=.env -p "process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || ''" | Out-String).Trim()
 if(!$taskOrigin){$taskOrigin=Read-Host 'Paste your current https://...trycloudflare.com website address'}
 $taskUri=$null
 if(![Uri]::TryCreate($taskOrigin,[UriKind]::Absolute,[ref]$taskUri) -or $taskUri.Scheme -ne 'https' -or $taskUri.UserInfo -or $taskUri.Query -or $taskUri.Fragment -or $taskUri.AbsolutePath -ne '/'){throw 'Enter only the HTTPS website origin, without /#/analysis or another page path.'}
 $taskOrigin=$taskUri.GetLeftPart([UriPartial]::Authority)
 $taskTemp=Join-Path ([IO.Path]::GetTempPath()) ('finance-update-'+[Guid]::NewGuid().ToString('N'))
 New-Item -ItemType Directory -Path $taskTemp | Out-Null
 [Net.ServicePointManager]::SecurityProtocol=[Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
 Write-Host '[1/4] Downloading the current website source...'
 $taskZip=Join-Path $taskTemp 'source.zip'
 Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/Jenny695/finance/archive/refs/heads/main.zip' -OutFile $taskZip
 Expand-Archive -LiteralPath $taskZip -DestinationPath (Join-Path $taskTemp 'source')
 $taskSource=(Get-ChildItem -LiteralPath (Join-Path $taskTemp 'source') -Directory | Select-Object -First 1).FullName
 if(!(Test-Path -LiteralPath (Join-Path $taskSource 'server/market-data.js'))){throw 'The downloaded source is incomplete. Nothing was replaced.'}
 Write-Host '[2/4] Backing up and replacing source files; your .env, databases and import-files are preserved...'
 $taskBackup=Join-Path $taskRoot ('.source-backups/'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,6))
 New-Item -ItemType Directory -Path $taskBackup | Out-Null
 $taskFiles=@('src','server','lib','public','scripts','index.html','package.json','package-lock.json','vite.config.js')
 foreach($taskFile in $taskFiles){
  $taskTarget=Join-Path $taskRoot $taskFile
  if(Test-Path -LiteralPath $taskTarget){Copy-Item -LiteralPath $taskTarget -Destination $taskBackup -Recurse -Force}
  Copy-Item -LiteralPath (Join-Path $taskSource $taskFile) -Destination $taskRoot -Recurse -Force
 }
 Write-Host ('Source backup: '+$taskBackup)
 Write-Host '[3/4] Installing dependencies and rebuilding the browser pages...'
 & npm.cmd ci --no-audit --no-fund
 if($LASTEXITCODE -ne 0){throw 'Dependency installation failed. The original source backup is preserved.'}
 & npm.cmd run build
 if($LASTEXITCODE -ne 0){throw 'The page build failed. The original source backup is preserved.'}
 $env:NODE_ENV='production';$env:PUBLIC_URL=$taskOrigin;$env:BIND_HOST='127.0.0.1';$env:PORT='3000'
 Write-Host '[4/4] Starting the updated website. Keep this window open.' -ForegroundColor Green
 Write-Host ('Open '+$taskOrigin+' and press Ctrl+F5.') -ForegroundColor Green
 & node --env-file-if-exists=.env server/public-server.js
 if($LASTEXITCODE -ne 0){throw 'Website startup failed. Read the error above; no account or product data was deleted.'}
} catch {
 Write-Host $_.Exception.Message -ForegroundColor Red
 exit 1
} finally {
 if($taskTemp -and (Test-Path -LiteralPath $taskTemp)){Remove-Item -LiteralPath $taskTemp -Recurse -Force}
}
