@echo off
echo ====================================================
echo  FactChecker Pro - MSIX Build for Microsoft Store
echo ====================================================
echo.
cd /d "C:\Users\Picho\Documents\FactCheckerPro-Desktop"
echo Working directory: %CD%
echo.
echo Running: npm run dist:appx
echo This will take a few minutes...
echo.
call npm run dist:appx > build-log.txt 2>&1
if %ERRORLEVEL% EQU 0 (
    echo.
    echo BUILD SUCCEEDED
    echo Output in: release\
    dir release\*.appx release\*.msix 2>nul
) else (
    echo.
    echo BUILD FAILED - check build-log.txt for details
)
echo.
pause
