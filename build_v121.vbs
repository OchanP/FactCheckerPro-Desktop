Set WshShell = WScript.CreateObject("WScript.Shell")
WshShell.Run "cmd /k cd /d ""C:\Users\Picho\Documents\FactCheckerPro-Desktop"" && call build-installer.bat", 1, False
