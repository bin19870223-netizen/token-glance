Option Explicit
Dim sh, fs, root, processEnv, exePath
Set sh = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
root = fs.GetParentFolderName(WScript.ScriptFullName)
Set processEnv = sh.Environment("PROCESS")
processEnv("TEMP") = root & "\runtime\temp"
processEnv("TMP") = root & "\runtime\temp"
exePath = root & "\node_modules\electron\dist\electron.exe"
If Not fs.FileExists(exePath) Then
  MsgBox "Token Glance runtime is missing.", 48, "Token Glance"
  WScript.Quit 1
End If
sh.CurrentDirectory = root
sh.Run Chr(34) & exePath & Chr(34) & " " & Chr(34) & root & Chr(34), 0, False
