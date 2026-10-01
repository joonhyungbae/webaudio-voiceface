# 켜기 (윈도우 PowerShell)
#
#   .\start.ps1                 마이크로 켠다. 브라우저에 조작 화면이 열린다
#   .\start.ps1 --sim           마이크 대신 시험용 녹음으로
#   .\start.ps1 --auto          체험을 끝없이 되풀이한다 (--sim 과 함께 쓰면 시연용)
#   .\start.ps1 --offline 30    장비 없이 시험용 녹음으로 한 바퀴 돌며 30초를 out.mp4 로 적는다
#   .\start.ps1 --host 0.0.0.0  폰이나 다른 컴퓨터에서 본다
#   .\start.ps1 --port 7001     포트를 바꾼다
#
# conda 환경(voiceface)으로 켠다.
Set-Location $PSScriptRoot
. .\scripts\conda.ps1
$Conda = Find-Conda
if (-not $Conda) { Write-Host "conda 가 없습니다. 먼저 설치해 주세요:  .\install.ps1" -ForegroundColor Red; exit 1 }
if (-not (Test-CondaEnv $Conda)) { Write-Host "conda 환경($EnvName)이 없습니다. 먼저 설치해 주세요:  .\install.ps1" -ForegroundColor Red; exit 1 }
& $Conda run --no-capture-output -n $EnvName python fetch_assets.py | Out-Null
& $Conda run --no-capture-output -n $EnvName python serve.py @args
