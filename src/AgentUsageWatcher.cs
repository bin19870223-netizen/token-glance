using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Management;
using System.Runtime.InteropServices;
using System.Text.RegularExpressions;
using System.Threading;
using System.Web.Script.Serialization;

internal static class AgentUsageWatcher
{
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool IsProcessInJob(IntPtr process, IntPtr job, out bool result);
    internal static bool InJob()
    {
        using (Process current = Process.GetCurrentProcess())
        {
            bool result;
            if (!IsProcessInJob(current.Handle, IntPtr.Zero, out result)) throw new System.ComponentModel.Win32Exception();
            return result;
        }
    }
    // WMI creates an independent process; detached Process.Start children still inherit a host's Job Object.
    internal static void RelaunchIndependent(string executable, string directory)
    {
        using (var process = new ManagementClass("Win32_Process"))
        using (var startupClass = new ManagementClass("Win32_ProcessStartup"))
        using (var startup = startupClass.CreateInstance())
        using (var input = process.GetMethodParameters("Create"))
        {
            startup["ShowWindow"] = (ushort)0;
            input["CommandLine"] = "\"" + executable + "\" --independent";
            input["CurrentDirectory"] = directory;
            input["ProcessStartupInformation"] = startup;
            using (var output = process.InvokeMethod("Create", input, null))
                if ((uint)output["ReturnValue"] != 0) throw new InvalidOperationException("Independent watcher launch failed");
        }
    }
    private static void Log(string root, string entry)
    {
        try
        {
            string file = Path.Combine(root, "runtime", "logs", "watcher.log");
            Directory.CreateDirectory(Path.GetDirectoryName(file));
            if (File.Exists(file) && new FileInfo(file).Length > 65536) File.WriteAllText(file, "");
            File.AppendAllText(file, DateTime.UtcNow.ToString("o") + " " + entry + Environment.NewLine);
        }
        catch { }
    }
    internal static readonly string[] AgentIds = { "codex", "claude", "deepseek" };
    internal static bool Matches(string agent, string name, string executable, string commandLine, string configured)
    {
        name = name ?? ""; executable = executable ?? ""; commandLine = commandLine ?? "";
        // A usage-only app-server must never keep its own monitor alive.
        if (agent == "codex" && name.Equals("codex.exe", StringComparison.OrdinalIgnoreCase)
            && Regex.IsMatch(commandLine, @"(?:^|\s)app-server(?:\s|$)", RegexOptions.IgnoreCase)) return false;
        if (agent == "claude" && name.Equals("node.exe", StringComparison.OrdinalIgnoreCase)
            && Regex.IsMatch(commandLine, @"(?:@anthropic-ai[\\/]claude-code|claude-code[\\/]cli\.js)", RegexOptions.IgnoreCase)) return true;
        foreach (string entry in configured.Split(new[] { ',', '，', ';', '；' }, StringSplitOptions.RemoveEmptyEntries))
        {
            string candidate = entry.Trim();
            if (!Regex.IsMatch(candidate, @"^[a-zA-Z0-9_.-]+\.exe$", RegexOptions.IgnoreCase)
                || !name.Equals(candidate, StringComparison.OrdinalIgnoreCase)) continue;
            if (agent == "codex" && name.Equals("ChatGPT.exe", StringComparison.OrdinalIgnoreCase))
                return executable.IndexOf("OpenAI.Codex", StringComparison.OrdinalIgnoreCase) >= 0
                    || executable.IndexOf(@"\OpenAI\Codex\", StringComparison.OrdinalIgnoreCase) >= 0;
            return true;
        }
        return false;
    }

    private static Dictionary<string, object> ReadSettings(string root)
    {
        try { return new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(Path.Combine(root, "runtime", "settings.json"))); }
        catch { return null; }
    }
    private static bool Active(Dictionary<string, object> settings)
    {
        object agentsValue, processesValue;
        if (!settings.TryGetValue("agents", out agentsValue)) return false;
        var agents = agentsValue as System.Collections.IEnumerable;
        if (agents == null) return false;
        var configured = settings.TryGetValue("watchProcesses", out processesValue) ? processesValue as Dictionary<string, object> : null;
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var selected = new Dictionary<string, string>();
        foreach (object value in agents)
        {
            string id = value as string;
            if (Array.IndexOf(AgentIds, id) < 0) continue;
            object processNames;
            string fallback = id == "codex" ? "ChatGPT.exe, codex.exe" : id == "claude" ? "claude.exe" : "DeepSeek.exe";
            string text = configured != null && configured.TryGetValue(id, out processNames) ? processNames as string : fallback;
            selected[id] = text ?? fallback;
            foreach (string item in selected[id].Split(new[] { ',', '，', ';', '；' }, StringSplitOptions.RemoveEmptyEntries))
                if (Regex.IsMatch(item.Trim(), @"^[a-zA-Z0-9_.-]+\.exe$", RegexOptions.IgnoreCase)) names.Add(item.Trim());
            if (id == "claude") names.Add("node.exe");
        }
        if (names.Count == 0) return false;
        string[] clauses = new string[names.Count]; int index = 0;
        foreach (string name in names) clauses[index++] = "Name='" + name + "'";
        using (var query = new ManagementObjectSearcher("SELECT Name,ExecutablePath,CommandLine FROM Win32_Process WHERE " + String.Join(" OR ", clauses)))
        using (var processes = query.Get())
        {
            foreach (ManagementObject p in processes)
            using (p)
                foreach (var pair in selected)
                    if (Matches(pair.Key, p["Name"] as string, p["ExecutablePath"] as string, p["CommandLine"] as string, pair.Value)) return true;
        }
        return false;
    }
    private static bool CompanionRunning(string executable)
    {
        foreach (Process p in Process.GetProcessesByName("electron"))
        using (p)
        {
            try { if (p.MainModule.FileName.Equals(executable, StringComparison.OrdinalIgnoreCase)) return true; }
            catch { }
        }
        return false;
    }
    private static void Signal(string root, string option)
    {
        string executable = Path.Combine(root, "node_modules", "electron", "dist", "electron.exe");
        var info = new ProcessStartInfo(executable, "\"" + root + "\" " + option);
        info.WorkingDirectory = root; info.UseShellExecute = false; info.CreateNoWindow = true;
        info.WindowStyle = ProcessWindowStyle.Hidden;
        info.EnvironmentVariables["TEMP"] = Path.Combine(root, "runtime", "temp");
        info.EnvironmentVariables["TMP"] = Path.Combine(root, "runtime", "temp");
        using (Process p = Process.Start(info)) { }
    }
    [STAThread]
    private static void Main(string[] args)
    {
        string root = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, ".."));
        Environment.SetEnvironmentVariable("TEMP", Path.Combine(root, "runtime", "temp"));
        Environment.SetEnvironmentVariable("TMP", Path.Combine(root, "runtime", "temp"));
        try
        {
            if (InJob())
            {
                if (Array.IndexOf(args, "--independent") >= 0) throw new InvalidOperationException("Watcher is still inside a launcher job");
                using (Process current = Process.GetCurrentProcess()) RelaunchIndependent(current.MainModule.FileName, root);
                return;
            }
        }
        catch (Exception error) { Log(root, "independent-start-failed " + error.GetType().Name); Environment.ExitCode = 1; return; }
        bool created;
        using (var mutex = new Mutex(true, @"Local\AgentHUD.Windows.StartWatcher", out created))
        {
            if (!created) return;
            Log(root, "started in-job=" + InJob());
            bool wasActive = false;
            try
            {
                while (true)
                {
                    var settings = ReadSettings(root); object mode;
                    if (settings == null || !settings.TryGetValue("startupMode", out mode) || (mode as string) != "agents") return;
                    try
                    {
                        bool active = Active(settings);
                        if (active && !wasActive) { Signal(root, "--background --agent-auto"); Log(root, "agent-active launch"); }
                        if (!active && wasActive && CompanionRunning(Path.Combine(root, "node_modules", "electron", "dist", "electron.exe"))) { Signal(root, "--agents-stopped"); Log(root, "agents-stopped"); }
                        wasActive = active;
                    }
                    catch { /* Retry transient process-query failures without closing the UI. */ }
                    Thread.Sleep(5000);
                }
            }
            finally { mutex.ReleaseMutex(); }
        }
    }
}
