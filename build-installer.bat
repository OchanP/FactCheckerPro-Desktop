@echo off
echo ====================================================
echo  FactChecker Pro - NSIS Installer Build
echo  (Direct install, no Microsoft Store needed)
echo ====================================================
echo.
cd /d "C:\Users\Picho\Documents\FactCheckerPro-Desktop"
echo Working directory: %CD%
echo.
echo Running: npm run dist
echo This will take a few minutes...
echo.
call npm run dist > build-installer-log.txt 2>&1
if %ERRORLEVEL% EQU 0 (
    echo.
    echo BUILD SUCCEEDED
    echo.
    echo Output in: release\
    dir release\*.exe 2>nul
    echo.
    echo Copy FactCheckerPro-Setup-x64.exe to the test machine and run it.
) else (
    echo.
    echo BUILD FAILED - check build-installer-log.txt for details
)
echo.
pause
