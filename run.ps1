$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:JAVA_HOME = Join-Path $root ".tools\jdk-21"
$env:Path = "$env:JAVA_HOME\bin;$(Join-Path $root '.tools\maven\bin');C:\Program Files\nodejs;$env:Path"
Write-Host "Starting Propel API on :8080 and web on :5173"
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$root\backend'; `$env:JAVA_HOME='$env:JAVA_HOME'; `$env:Path='$env:Path'; mvn spring-boot:run"
Start-Process powershell -ArgumentList "-NoExit","-Command","cd '$root\frontend'; `$env:Path='C:\Program Files\nodejs;' + `$env:Path; npm run dev"
