@echo off
echo ====================================================
echo  Force Railway redeploy - Gemini 2.5 Flash fix
echo ====================================================
echo.
cd /d "C:\Users\Picho\Documents\Web browser Factchecker extension"
git add server/routes/social.js server/index.js
git commit -m "fix: force redeploy - gemini-2.5-flash, safety try-catch in analyze route, bump to v1.3.1"
git push origin main
echo.
echo Done. Verify at: https://factchecker-pro-production.up.railway.app/api/health
echo It should show version 1.3.1 when the new deploy is live.
echo.
pause
