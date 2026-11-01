REM Hide command echo for a friendly double-click experience.
@echo off
REM Explain the manual Word shutdown step.
echo Please close all Word windows yourself before continuing.
REM Wait for the user to read this instruction.
pause
REM Remove only this add-in's per-user registry value.
reg delete "HKCU\Software\Microsoft\Office\16.0\WEF\Developer" /v "cf7ed621-a0dd-48da-a316-9d2a576e8185" /f >nul 2>nul
REM Remove only this add-in's installed manifest.
del "%LOCALAPPDATA%\ReadAloudPlus\manifest.xml" 2>nul
REM Remove the installation folder only if empty.
rmdir "%LOCALAPPDATA%\ReadAloudPlus" 2>nul
REM Explain completion and the next step.
echo Read Aloud+ removed. You can reopen Word.
REM Keep this message visible.
pause
