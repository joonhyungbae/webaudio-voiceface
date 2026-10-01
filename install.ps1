# 한 줄로 깔기 (윈도우 PowerShell)
#
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   irm https://raw.githubusercontent.com/joonhyungbae/webaudio-voiceface/main/install.ps1 -OutFile "$env:TEMP\install.ps1"
#   & "$env:TEMP\install.ps1"
#
# 하는 일: 저장소 받기 → conda 확인(없으면 Miniforge 를 깐다) → conda 환경 만들기
#          → 얼굴 모델과 시험용 녹음 받기 → 켜는 법 알려 주기.
$ErrorActionPreference = "Stop"
$Name = "webaudio-voiceface"
$Repo = "https://github.com/joonhyungbae/$Name"

function Say($t) { Write-Host "▸ $t" -ForegroundColor Cyan }

# ── 1. 저장소 ──
if ((Test-Path "serve.py") -and (Test-Path "web")) {
  $Dir = (Get-Location).Path
  Say "이미 받아 둔 폴더에서 실행합니다: $Dir"
} else {
  $Dir = Join-Path (Get-Location).Path $Name
  if (Test-Path $Dir) {
    Say "폴더가 이미 있어 그대로 씁니다: $Dir"
  } elseif (Get-Command git -ErrorAction SilentlyContinue) {
    Say "받는 중: $Dir"
    git clone -q $Repo $Dir
  } else {
    Say "받는 중 (압축 파일): $Dir"
    $Zip = Join-Path $env:TEMP "$Name.zip"
    Invoke-WebRequest "$Repo/archive/refs/heads/main.zip" -OutFile $Zip
    Expand-Archive $Zip -DestinationPath $env:TEMP -Force
    Move-Item (Join-Path $env:TEMP "$Name-main") $Dir
  }
}
Set-Location $Dir
. .\scripts\conda.ps1

# ── 2. conda. 언제나 conda 환경으로 돌린다 ──
$Conda = Find-Conda
if ($Conda) {
  Say "conda 를 씁니다: $Conda"
} else {
  Say "conda 가 없어 Miniforge 를 깝니다 (~\miniforge3, 몇 분 걸립니다)"
  $Conda = Install-Miniforge
}

# ── 3. 환경 ──
if (Test-CondaEnv $Conda) {
  Say "이미 있는 환경을 최신으로 맞춥니다: $EnvName"
  & $Conda env update -q -n $EnvName -f environment.yml --prune | Out-Null
} else {
  Say "conda 환경을 만듭니다: $EnvName"
  & $Conda env create -q -f environment.yml | Out-Null
}

# ── 4. 얼굴 랜드마크 모델과 시험용 녹음 ──
Say "얼굴 랜드마크 모델, 말하는 영상, 시험용 녹음을 받습니다 (약 45MB)"
& $Conda run --no-capture-output -n $EnvName python fetch_assets.py
if ($LASTEXITCODE -ne 0) { Say "받지 못했습니다. 인터넷을 확인하세요. 나중에 .\start.ps1 이 다시 받아 봅니다." }

Write-Host ""
Say "다 됐습니다. 이렇게 켭니다."
Write-Host ""
Write-Host "    cd `"$Dir`""
Write-Host "    .\start.ps1"
Write-Host ""
Write-Host "  브라우저가 127.0.0.1:7000 으로 열립니다. 끌 때는 Ctrl+C 입니다."
