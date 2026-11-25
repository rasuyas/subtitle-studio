Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
pyw = root & "\venv\Scripts\pythonw.exe"
sh.CurrentDirectory = root
If fso.FileExists(pyw) Then
    sh.Run """" & pyw & """ -m app.desktop", 0, False
Else
    sh.Run """" & root & "\launch.bat""", 1, False
End If
