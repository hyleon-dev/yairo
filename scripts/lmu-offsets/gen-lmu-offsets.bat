@echo off
rem Regenerates src\main\sim\lmu\lmuOffsets.ts (struct sizes and field offsets of the
rem LMU shared memory) from the headers in the LMU install dir.
rem Only needed when an LMU update changes the headers.
rem Needs MSVC Build Tools. Usage: gen-lmu-offsets.bat [path to LMU install dir]
setlocal
set "LMU_DIR=%~1"
if "%LMU_DIR%"=="" set "LMU_DIR=D:\SteamLibrary\steamapps\common\Le Mans Ultimate"
set "HDR=%LMU_DIR%\Support\SharedMemoryInterface"
if not exist "%HDR%\SharedMemoryInterface.hpp" (
  echo Header not found: %HDR%
  exit /b 1
)

set "VCVARS="
for /d %%d in ("C:\Program Files (x86)\Microsoft Visual Studio\*" "C:\Program Files\Microsoft Visual Studio\*") do (
  for /d %%e in ("%%~d\*") do (
    if exist "%%~e\VC\Auxiliary\Build\vcvars64.bat" set "VCVARS=%%~e\VC\Auxiliary\Build\vcvars64.bat"
  )
)
if "%VCVARS%"=="" (
  echo MSVC Build Tools not found
  exit /b 1
)
call "%VCVARS%" >nul 2>nul || exit /b 1

set "OUT=%TEMP%\gen-lmu-offsets"
if not exist "%OUT%" mkdir "%OUT%"
cl /nologo /EHsc /std:c++17 /I "%HDR%" /Fo"%OUT%\\" /Fe"%OUT%\gen.exe" "%~dp0gen-lmu-offsets.cpp" >"%OUT%\build.log" || (type "%OUT%\build.log" & exit /b 1)
"%OUT%\gen.exe" > "%~dp0..\..\src\main\sim\lmu\lmuOffsets.ts" || exit /b 1
echo Wrote src\main\sim\lmu\lmuOffsets.ts
