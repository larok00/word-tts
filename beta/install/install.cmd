REM Hide command echo for a friendly double-click experience.
@echo off
REM Keep environment changes local to this script.
setlocal
REM Explain the required manual step; never close Word automatically.
echo Please close all Word windows yourself before continuing.
REM Wait until the user has read the instructions.
pause
REM Require the built manifest beside this script.
if not exist "%~dp0manifest.xml" goto missing
REM Create the per-user installation folder without administrator access.
mkdir "%LOCALAPPDATA%\ReadAloudPlus" 2>nul
REM Copy the deployment manifest into its permanent location.
copy /y "%~dp0manifest.xml" "%LOCALAPPDATA%\ReadAloudPlus\manifest.xml" >nul
REM Abort if copying failed.
if errorlevel 1 goto failed
REM Register this add-in for the current Windows user only.
reg add "HKCU\Software\Microsoft\Office\16.0\WEF\Developer" /v "cf7ed621-a0dd-48da-a316-9d2a576e8185" /t REG_SZ /d "%LOCALAPPDATA%\ReadAloudPlus\manifest.xml" /f >nul
REM Abort if registry access was blocked.
if errorlevel 1 goto failed
REM Explain the optional shared Office cache removal.
echo Optional: clear Office's web add-in cache. Other add-ins will reload too.
REM Ask explicitly before deleting cache files; No is the default.
choice /c YN /n /t 30 /d N /m "Clear cache? [Y/N] "
REM Skip deletion for No or any unexpected result.
if errorlevel 2 goto done
REM Only an explicit Yes (result 1) authorizes deletion.
if not errorlevel 1 goto done
REM Delete only the known per-user Wef cache folder.
rmdir /s /q "%LOCALAPPDATA%\Microsoft\Office\16.0\Wef" 2>nul
REM Continue with next steps.
:done
REM Explain where the add-in should appear.
echo Installed. Open Word, then Home - Read Aloud+.
REM Offer an alternate discovery path.
echo If needed, use My Add-ins - Developer Add-ins. Internet is needed on first use.
REM Keep this window open until dismissed.
pause
REM Finish successfully.
exit /b 0
REM Explain how to correct a missing package file.
:missing
REM Show a useful missing-manifest message.
echo manifest.xml is missing. Use the complete dist\install folder from the build.
REM Route to the common failure exit.
goto failed
REM Handle copy or registry failures.
:failed
REM Explain who can help without requesting administrator rights.
echo Installation did not finish. Ask Koral for help with this message.
REM Keep the error visible.
pause
REM Return an error result.
exit /b 1
