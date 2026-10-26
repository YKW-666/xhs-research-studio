Add-Type -AssemblyName System.Windows.Forms
$state = if ($env:XHS_STATE_DIR) { $env:XHS_STATE_DIR } else { Join-Path $env:LOCALAPPDATA 'XhsResearch' }
$form = New-Object Windows.Forms.Form
$form.Text = 'Dots API key - local configuration'
$form.Width = 520; $form.Height = 220; $form.StartPosition = 'CenterScreen'
$label = New-Object Windows.Forms.Label
$label.Text = 'Paste your own Dots API key. It is saved only on this computer.'
$label.Left = 20; $label.Top = 20; $label.Width = 470; $label.Height = 40
$box = New-Object Windows.Forms.TextBox
$box.Left = 20; $box.Top = 70; $box.Width = 460; $box.UseSystemPasswordChar = $true
$save = New-Object Windows.Forms.Button
$save.Text = 'Save locally'; $save.Left = 330; $save.Top = 115; $save.Width = 150
$save.Add_Click({
    if ([string]::IsNullOrWhiteSpace($box.Text)) { return }
    $temporary = $null
    try {
    New-Item -ItemType Directory -Force -Path $state | Out-Null
    $keyFile = Join-Path $state 'dots-api-key.txt'
    $temporary = Join-Path $state ('dots-key-' + [Guid]::NewGuid().ToString('N') + '.tmp')
    [IO.File]::WriteAllText($temporary,'')
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls $temporary /inheritance:r /grant:r "${identity}:F" 'SYSTEM:F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'File permission setup failed' }
    [IO.File]::WriteAllText($temporary,$box.Text.Trim(),(New-Object Text.UTF8Encoding($false)))
    if (Test-Path -LiteralPath $keyFile) {
        & icacls $keyFile /inheritance:r /grant:r "${identity}:F" 'SYSTEM:F' | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Existing file permission setup failed' }
        [IO.File]::Replace($temporary,$keyFile,$null)
    } else { [IO.File]::Move($temporary,$keyFile) }
    $box.Clear(); $form.Close()
    } catch { [Windows.Forms.MessageBox]::Show('Key was not saved. Check the local directory and permissions, then try again. Never post the key in an issue.') }
    finally { if ($temporary -and (Test-Path -LiteralPath $temporary)) { [IO.File]::Delete($temporary) } }
})
$form.Controls.AddRange(@($label,$box,$save)); $form.AcceptButton=$save
[void]$form.ShowDialog()
