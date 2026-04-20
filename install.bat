@echo off
setlocal enabledelayedexpansion

:: Define ANSI color codes
for /f %%A in ('echo prompt $E^| cmd') do set "ESC=%%A"
set "RED=!ESC![31m"
set "GREEN=!ESC![32m"
set "YELLOW=!ESC![33m"
set "MUTED=!ESC![2m"
set "NC=!ESC![0m"
set "EXCL=!"

if not defined COSTRICT_BASE_URL (
    set COSTRICT_BASE_URL=https://zgsm.sangfor.com
)
set BASE_URL=%COSTRICT_BASE_URL%

:usage
if "%~1"=="-h" goto :show_help
if "%~1"=="--help" goto :show_help
if "%~1"=="-v" goto :check_version_arg
if "%~1"=="--version" goto :check_version_arg
if "%~1"=="-b" goto :check_binary_arg
if "%~1"=="--binary" goto :check_binary_arg
goto :main

:show_help
echo.
echo CoStrict Installer for Windows
echo.
echo Usage: install.bat [options]
echo.
echo Options:
echo     -h, --help              Display this help message
echo     -v, --version ^<version^> Install a specific version (e.g. 1.0.180)
echo     -b, --binary ^<path^>     Install from a local binary instead of downloading
echo.
echo Environment Variables:
echo     COSTRICT_BASE_URL       Base URL for downloading (default: https://zgsm.sangfor.com)
echo.
echo Examples:
echo     install.bat -v 1.0.180
echo     COSTRICT_BASE_URL=https://zgsm.sangfor.com install.bat -v 1.0.180
echo     install.bat -b C:\path\to\costrict-cli.exe
echo.
exit /b 0

:check_version_arg
if "%~2"=="" (
    echo !RED!Error: --version requires a version argument!NC!
    exit /b 1
)
set "REQUESTED_VERSION=%~2"
shift
shift
if not "%~1"=="" goto :parse_args
goto :main

:check_binary_arg
if "%~2"=="" (
    echo !RED!Error: --binary requires a path argument!NC!
    exit /b 1
)
set "BINARY_PATH=%~2"
goto :main

:parse_args
if "%~1"=="-h" goto :show_help
if "%~1"=="--help" goto :show_help
if "%~1"=="-v" goto :check_version_arg
if "%~1"=="--version" goto :check_version_arg
if "%~1"=="-b" goto :check_binary_arg
if "%~1"=="--binary" goto :check_binary_arg
echo !YELLOW!Warning: Unknown option '%~1'!NC!
shift
goto :parse_args

:main
set "INSTALL_DIR=%USERPROFILE%\.costrict\bin"
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: ============================================================
:: Pre-install environment checks
:: ============================================================
echo !MUTED!Running pre-install checks...!NC!

:: 1. Check PowerShell availability
where powershell >nul 2>&1
if errorlevel 1 (
    echo !RED!Error: PowerShell is required but not found in PATH!NC!
    echo   PowerShell is needed for downloading and extracting files.
    echo   Fix: Ensure PowerShell is installed and accessible in your PATH.
    exit /b 1
)

:: 2. Check if cs.exe already exists from a different location
where cs.exe >nul 2>&1
if not errorlevel 1 (
    for /f "delims=" %%P in ('where cs.exe 2^>nul') do (
        if /i not "%%P"=="!INSTALL_DIR!\cs.exe" (
            echo !YELLOW!Warning: cs.exe already found at: %%P!NC!
            echo   This installation will place cs.exe at !INSTALL_DIR!\cs.exe
            echo   PATH order will determine which runs first.
        )
    )
)

:: 3. Check for existing installation
if exist "!INSTALL_DIR!\cs.exe" (
    echo !MUTED!Note: Existing installation found at !INSTALL_DIR!\cs.exe. It will be overwritten.!NC!
)

:: 4. Check COSTRICT_BASE_URL custom value
if not "!COSTRICT_BASE_URL!"=="https://zgsm.sangfor.com" (
    echo !MUTED!Note: Using custom COSTRICT_BASE_URL: !COSTRICT_BASE_URL!!NC!
)

:: 5. Network connectivity check (skip for --binary installs)
if "%BINARY_PATH%"=="" (
    powershell -NoProfile -Command "try { $null = Invoke-WebRequest -Uri '!BASE_URL!' -Method Head -TimeoutSec 10 -UseBasicParsing; exit 0 } catch { exit 1 }" >nul 2>&1
    if errorlevel 1 (
        echo !YELLOW!Warning: Cannot reach !BASE_URL!!NC!
        echo   Possible causes:
        echo     - No internet connection
        echo     - Firewall or proxy blocking the connection
        echo   Fix: Check your network and try again
    )
)

echo !GREEN!  Pre-install checks completed!NC!
echo.

:: ============================================================
:: Handle --binary fast path
:: ============================================================
if not "%BINARY_PATH%"=="" (
    if not exist "%BINARY_PATH%" (
        echo !RED!Error: Binary not found at %BINARY_PATH%!NC!
        echo   Possible causes:
        echo     - File path is incorrect
        echo     - File was moved or deleted
        echo   Fix: Verify the file exists: dir "%BINARY_PATH%"
        exit /b 1
    )
    echo Installing cs from: %BINARY_PATH%
    copy /Y "%BINARY_PATH%" "%INSTALL_DIR%\cs.exe" >nul
    if errorlevel 1 (
        echo !RED!Error: Failed to copy binary!NC!
        echo   Possible causes:
        echo     - Antivirus blocking the copy operation
        echo     - Disk is full
        echo   Fix: Check disk space and antivirus settings
        exit /b 1
    )
    echo !GREEN![OK] Installed successfully!NC!
    goto :post_install_verify
)

:: ============================================================
:: Fetch version
:: ============================================================
if "%REQUESTED_VERSION%"=="" (
    echo No version specified, fetching latest version from server...
    set "LATEST_URL=%BASE_URL%/costrict-cli/pkg/latest.json"
    echo Fetching from: !LATEST_URL!

    :: Download latest.json and extract version using PowerShell
    for /f "delims=" %%V in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$url='!LATEST_URL!'; try { $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30; $json = $response.Content | ConvertFrom-Json; if ($json.tag_name) { Write-Output $json.tag_name } } catch { Write-Error $_.Exception.Message }"') do (
        set "REQUESTED_VERSION=%%V"
    )

    if "!REQUESTED_VERSION!"=="" (
        echo !RED!Error: Failed to fetch latest version from !LATEST_URL!!NC!
        echo.
        echo   Possible causes:
        echo     - Server is unreachable
        echo     - PowerShell execution policy is blocking scripts
        echo     - Network proxy is not configured
        echo   Fix:
        echo     - Check network: powershell -Command "Invoke-WebRequest '!LATEST_URL!'"
        echo     - Or specify version manually: install.bat -v VERSION
        exit /b 1
    )
    echo Using latest version: !REQUESTED_VERSION!
)

:: Remove leading 'v' if present
if "%REQUESTED_VERSION:~0,1%"=="v" (
    set "REQUESTED_VERSION=%REQUESTED_VERSION:~1%"
)

:: Detect CPU architecture
set "ARCH=x64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCH=arm64"
if /i "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "ARCH=arm64"

:: Keep download target in sync with packages/opencode/bin/cs resolution:
:: - windows x64 always uses baseline
:: - windows arm64 uses non-baseline
set "TARGET=costrict-cs-windows-!ARCH!"
if /i "!ARCH!"=="x64" set "TARGET=!TARGET!-baseline"

echo Detected architecture: !ARCH!

set "ARCHIVE_EXT=.zip"
set "DOWNLOAD_URL=!BASE_URL!/costrict-cli/pkg/!REQUESTED_VERSION!/!TARGET!!ARCHIVE_EXT!"

echo.
echo Downloading cs version: !REQUESTED_VERSION!
echo Target: !TARGET!
echo URL: !DOWNLOAD_URL!
echo.

:: Use USERPROFILE if TEMP is not available
if not defined TEMP (
    set "TEMP=%USERPROFILE%\AppData\Local\Temp"
)

set "TEMP_DIR=!TEMP!\costrict-cli-!RANDOM!"
echo Creating temp directory: !TEMP_DIR!
mkdir "!TEMP_DIR!" 2>nul
if not exist "!TEMP_DIR!" (
    echo !RED!Error: Failed to create temp directory: !TEMP_DIR!!NC!
    echo   Possible causes:
    echo     - TEMP directory does not exist: !TEMP!
    echo     - Insufficient permissions
    echo   Fix:
    echo     - Check TEMP path: echo %%TEMP%%
    echo     - Create it manually: mkdir "!TEMP!"
    exit /b 1
)

set "ARCHIVE_PATH=!TEMP_DIR!\!TARGET!!ARCHIVE_EXT!"

:: Download using PowerShell in background with progress monitoring
echo Downloading from: !DOWNLOAD_URL!
echo Saving to: !ARCHIVE_PATH!
echo.

:: Create a PowerShell script for background download with status sentinel
set "DOWNLOAD_SCRIPT=!TEMP_DIR!\download.ps1"
set "STATUS_FILE=!TEMP_DIR!\download.status"
echo $ProgressPreference = 'SilentlyContinue' > "!DOWNLOAD_SCRIPT!"
echo try { >> "!DOWNLOAD_SCRIPT!"
echo     $webClient = New-Object System.Net.WebClient >> "!DOWNLOAD_SCRIPT!"
echo     $webClient.Headers.Add('User-Agent', 'CoStrict-Installer') >> "!DOWNLOAD_SCRIPT!"
echo     $webClient.DownloadFile('!DOWNLOAD_URL!', '!ARCHIVE_PATH!') >> "!DOWNLOAD_SCRIPT!"
echo     'SUCCESS' ^| Out-File -FilePath '!STATUS_FILE!' -Encoding ascii >> "!DOWNLOAD_SCRIPT!"
echo     exit 0 >> "!DOWNLOAD_SCRIPT!"
echo } catch { >> "!DOWNLOAD_SCRIPT!"
echo     "FAIL:$($_.Exception.Message)" ^| Out-File -FilePath '!STATUS_FILE!' -Encoding ascii >> "!DOWNLOAD_SCRIPT!"
echo     exit 1 >> "!DOWNLOAD_SCRIPT!"
echo } >> "!DOWNLOAD_SCRIPT!"

:: Start download in background
start /B powershell -NoProfile -ExecutionPolicy Bypass -File "!DOWNLOAD_SCRIPT!" > "!TEMP_DIR!\download.log" 2>&1

:: Monitor download progress with timeout
echo Downloading...
set /a LAST_SIZE=0
set /a RETRY_COUNT=0
set /a WAIT_COUNT=0
set /a MAX_WAIT=60
:download_loop
timeout /t 2 /nobreak >nul 2>&1
set /a WAIT_COUNT+=1

:: Check if status file exists (download completed or failed)
if exist "!STATUS_FILE!" goto :download_done

:: Check if file exists and get size
if exist "!ARCHIVE_PATH!" (
    for %%A in ("!ARCHIVE_PATH!") do set CURRENT_SIZE=%%~zA

    :: Display progress
    set /a SIZE_MB=!CURRENT_SIZE! / 1048576
    echo   Downloaded: !SIZE_MB! MB ^(!CURRENT_SIZE! bytes^)

    :: Check if download is still progressing
    if !CURRENT_SIZE! GTR !LAST_SIZE! (
        set LAST_SIZE=!CURRENT_SIZE!
        set RETRY_COUNT=0
        goto :download_loop
    )

    :: Check if download is complete (file size stable for multiple checks)
    set /a RETRY_COUNT+=1
    if !RETRY_COUNT! LSS 3 (
        goto :download_loop
    )
) else (
    :: File doesn't exist yet, wait with timeout
    if !WAIT_COUNT! GEQ !MAX_WAIT! (
        echo !RED!Error: Download timed out after !MAX_WAIT! attempts!NC!
        echo   Possible causes:
        echo     - Network connection is too slow or dropped
        echo     - Server is not responding
        echo     - Firewall is blocking the download
        echo   Fix:
        echo     - Check your network connection
        echo     - Try downloading manually: powershell -Command "Invoke-WebRequest '!DOWNLOAD_URL!' -OutFile cs.zip"
        rmdir /S /Q "!TEMP_DIR!" 2>nul
        exit /b 1
    )
    echo   Waiting for download to start... ^(!WAIT_COUNT!/!MAX_WAIT!^)
    goto :download_loop
)

:download_done
:: Check download status via sentinel file
if exist "!STATUS_FILE!" (
    for /f "usebackq delims=" %%S in ("!STATUS_FILE!") do set "DL_STATUS=%%S"
    if "!DL_STATUS:~0,4!"=="FAIL" (
        set "DL_ERROR=!DL_STATUS:~5!"
        echo !RED!Error: Download failed: !DL_ERROR!!NC!
        echo   Possible causes:
        echo     - Version !REQUESTED_VERSION! does not exist for this platform
        echo     - Network error or server returned an error
        echo     - Antivirus quarantined the downloaded file
        echo   Fix:
        echo     - Verify the URL is accessible in a browser: !DOWNLOAD_URL!
        echo     - Try a different version: install.bat -v VERSION
        echo     - Check antivirus quarantine list
        rmdir /S /Q "!TEMP_DIR!" 2>nul
        exit /b 1
    )
)

echo.
echo Download completed successfully
echo.

if not exist "!ARCHIVE_PATH!" (
    echo !RED!Error: Download failed - archive file not created!NC!
    echo   Possible causes:
    echo     - Network connection was interrupted
    echo     - Firewall blocked the download
    echo     - Antivirus quarantined the file
    echo   Fix:
    echo     - Check antivirus quarantine/logs
    echo     - Whitelist !DOWNLOAD_URL! in your firewall
    echo     - Try manual download: powershell -Command "Invoke-WebRequest '!DOWNLOAD_URL!' -OutFile cs.zip"
    rmdir /S /Q "!TEMP_DIR!" 2>nul
    exit /b 1
)

:: Check if file has content and size
echo Verifying downloaded file...
for %%A in ("!ARCHIVE_PATH!") do (
    set FILE_SIZE=%%~zA
)

:: Ensure FILE_SIZE is set
if not defined FILE_SIZE (
    echo !RED!Error: Could not determine file size!NC!
    echo   Fix: Re-run the installer
    rmdir /S /Q "!TEMP_DIR!"
    exit /b 1
)

echo File size: !FILE_SIZE! bytes

:: Check minimum size (1KB)
if !FILE_SIZE! LSS 1024 (
    echo !RED!Error: Downloaded file is too small ^(!FILE_SIZE! bytes^)!NC!
    echo   This usually means the server returned an error page instead of the binary.
    echo   Possible causes:
    echo     - Version !REQUESTED_VERSION! does not exist for platform !TARGET!
    echo     - Server returned an HTML error page
    echo   Fix:
    echo     - Verify the version exists: check !BASE_URL!/costrict-cli/pkg/latest.json
    echo     - Try a different version: install.bat -v VERSION
    echo     - Check if your network requires a proxy
    rmdir /S /Q "!TEMP_DIR!"
    exit /b 1
)

echo File verification passed
echo.
echo Extracting archive...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Write-Host 'Starting extraction...'; Expand-Archive -Path '!ARCHIVE_PATH!' -DestinationPath '!TEMP_DIR!' -Force; Write-Host 'Extraction completed successfully'; exit 0 } catch { Write-Host 'Extract failed:' $_.Exception.Message; if ($_.Exception.InnerException) { Write-Host 'Inner exception:' $_.Exception.InnerException.Message }; exit 1 }"

if errorlevel 1 (
    echo.
    echo !RED!Error: Failed to extract archive!NC!
    echo   Possible causes:
    echo     - Downloaded file is corrupted or not a valid ZIP
    echo     - Disk is full
    echo     - Path too long ^(Windows 260 char limit^)
    echo   Fix:
    echo     - Delete temp directory and re-run: rmdir /S /Q "!TEMP_DIR!"
    echo     - Try downloading manually from: !DOWNLOAD_URL!
    echo     - Check disk space: dir !TEMP!
    rmdir /S /Q "!TEMP_DIR!"
    exit /b 1
)

echo.

set "BINARY_SOURCE=!TEMP_DIR!\bin\cs.exe"
if not exist "!BINARY_SOURCE!" (
    echo !RED!Error: Binary not found in extracted archive!NC!
    echo   Expected: !BINARY_SOURCE!
    echo   Possible causes:
    echo     - Archive structure is unexpected
    echo     - Wrong platform detected ^(detected: !TARGET!^)
    echo   Fix:
    echo     - Re-run the installer
    echo     - Report this issue if it persists
    rmdir /S /Q "!TEMP_DIR!"
    exit /b 1
)

move /Y "!BINARY_SOURCE!" "!INSTALL_DIR!\cs.exe" >nul
if errorlevel 1 (
    echo !RED!Error: Failed to move binary to !INSTALL_DIR!!NC!
    echo   Possible causes:
    echo     - Antivirus is locking the file
    echo     - cs.exe is currently running in another terminal
    echo     - Insufficient permissions on !INSTALL_DIR!
    echo   Fix:
    echo     - Close any running cs.exe processes: taskkill /IM cs.exe /F
    echo     - Temporarily disable antivirus, then retry
    echo     - Check folder permissions: icacls "!INSTALL_DIR!"
    rmdir /S /Q "!TEMP_DIR!"
    exit /b 1
)

rmdir /S /Q "!TEMP_DIR!"

echo !GREEN![OK] Installed successfully to: !INSTALL_DIR!\cs.exe!NC!

:add_to_path
:: Check if INSTALL_DIR is already in user PATH using exact match
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p = [Environment]::GetEnvironmentVariable('PATH', 'User') -split ';'; if ('!INSTALL_DIR!' -in $p) { exit 0 } else { exit 1 }" >nul 2>&1
if not errorlevel 1 (
    echo.
    echo !GREEN![OK] PATH already configured in user environment!NC!
    goto :install_base_url
)

:: Add INSTALL_DIR to user PATH environment variable using PowerShell
echo.
echo Adding !INSTALL_DIR! to user PATH...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$currentPath = [Environment]::GetEnvironmentVariable('PATH', 'User'); $entries = $currentPath -split ';'; if ('!INSTALL_DIR!' -notin $entries) { $newPath = $currentPath + ';!INSTALL_DIR!'; [Environment]::SetEnvironmentVariable('PATH', $newPath, 'User'); Write-Host '[OK] Added to user PATH environment variable' } else { Write-Host '[OK] Already in user PATH' }"
if errorlevel 1 (
    echo !YELLOW!Warning: Failed to add to user PATH!NC!
    echo   Fix: Manually add !INSTALL_DIR! to your PATH environment variable:
    echo     setx PATH "%%PATH%%;!INSTALL_DIR!"
)
set "ENV_UPDATED=1"

:install_base_url
:: Add COSTRICT_BASE_URL to system environment variables (user level)
echo.
echo Setting COSTRICT_BASE_URL environment variable...

:: Use setx to add to user environment variables
setx COSTRICT_BASE_URL "!COSTRICT_BASE_URL!" >nul

if errorlevel 1 (
    echo !YELLOW!Warning: Failed to set COSTRICT_BASE_URL permanently!NC!
    echo   Fix: Set it manually:
    echo     setx COSTRICT_BASE_URL "!COSTRICT_BASE_URL!"
) else (
    echo !GREEN![OK] Added COSTRICT_BASE_URL to user environment variables!NC!
)

:: ============================================================
:: Post-install verification
:: ============================================================
:post_install_verify
echo.
echo !MUTED!Running post-install verification...!NC!

:: 1. Binary exists
if exist "!INSTALL_DIR!\cs.exe" (
    echo   !GREEN![PASS] Binary exists at !INSTALL_DIR!\cs.exe!NC!
) else (
    echo   !RED![FAIL] Binary not found at !INSTALL_DIR!\cs.exe!NC!
    echo     Fix: Re-run the installer
    goto :verify_done
)

:: 2. Binary runs (version check)
set "VER_OUTPUT="
for /f "delims=" %%V in ('"!INSTALL_DIR!\cs.exe" --version 2^>^&1') do (
    set "VER_OUTPUT=%%V"
)
if defined VER_OUTPUT (
    echo   !GREEN![PASS] Binary runs successfully ^(version: !VER_OUTPUT!^)!NC!
) else (
    "!INSTALL_DIR!\cs.exe" --version >nul 2>&1
    if errorlevel 1 (
        echo   !RED![FAIL] Binary exists but failed to execute!NC!
        echo     Possible causes:
        echo       - Missing Visual C++ Redistributable
        echo       - Antivirus blocking execution
        echo       - Corrupted download
        echo     Fix:
        echo       - Install VC++ Redistributable: https://aka.ms/vs/17/release/vc_redist.x64.exe
        echo       - Add cs.exe to antivirus whitelist
        echo       - Re-run the installer
    ) else (
        echo   !GREEN![PASS] Binary runs successfully!NC!
    )
)

:: 3. PATH verification (check if cs.exe is discoverable)
where cs.exe >nul 2>&1
if not errorlevel 1 (
    echo   !GREEN![PASS] cs.exe is discoverable in current PATH!NC!
) else (
    echo   !YELLOW![WARN] cs.exe not in current PATH ^(will be after terminal restart^)!NC!
    echo     Fix: Restart your terminal, or run: set "PATH=!INSTALL_DIR!;%%PATH%%"
)

:: 4. COSTRICT_BASE_URL verification
if defined COSTRICT_BASE_URL (
    echo   !GREEN![PASS] COSTRICT_BASE_URL is set to: !COSTRICT_BASE_URL!!NC!
) else (
    echo   !YELLOW![WARN] COSTRICT_BASE_URL not set in current session!NC!
    echo     It will be available after terminal restart.
)

:verify_done
echo.

echo !GREEN!========================================!NC!
echo !GREEN!  CoStrict CLI Installation Complete!NC!
echo !GREEN!========================================!NC!
echo.

if "!ENV_UPDATED!"=="1" (
    echo !RED![!EXCL!] IMPORTANT: Please restart your terminal for PATH changes to take effect!NC!
    echo.
)

echo To start:
echo.
echo   cd ^<project^>    # Open directory
echo   cs       # Run command
echo.
echo For more information visit https://docs.costrict.ai
echo.

exit /b 0
