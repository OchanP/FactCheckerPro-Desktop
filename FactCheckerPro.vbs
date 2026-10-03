' FactChecker Pro — silent launcher (no console window)
' Double-click this file to open the app without a terminal staying open.
Set fso      = CreateObject("Scripting.FileSystemObject")
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
' 0 = SW_HIDE  (window is completely hidden)
' False = don't wait for the process to finish
WshShell.Run "cmd /c npx electron .", 0, False
