using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
internal static class WatcherSelfTest
{
    [StructLayout(LayoutKind.Sequential)]
    private struct BasicLimits
    {
        public long ProcessTime, JobTime;
        public uint Flags;
        public UIntPtr MinimumWorkingSet, MaximumWorkingSet;
        public uint ActiveProcesses;
        public UIntPtr Affinity;
        public uint Priority, Scheduling;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct ExtendedLimits
    {
        public BasicLimits Basic;
        public ulong ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [DllImport("kernel32.dll", SetLastError = true)] private static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool SetInformationJobObject(IntPtr job, int type, ref ExtendedLimits limits, uint size);
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")] private static extern bool CloseHandle(IntPtr handle);
    private static bool WaitForMarker(string marker, string expected)
    {
        for (int i = 0; i < 100; i++)
        {
            try { if (File.Exists(marker) && File.ReadAllText(marker) == expected) return true; }
            catch (IOException) { }
            Thread.Sleep(100);
        }
        return false;
    }
    private static void CheckHostExit(string marker)
    {
        string gateName = @"Local\TokenGlance.Test." + Guid.NewGuid().ToString("N");
        IntPtr job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) throw new System.ComponentModel.Win32Exception();
        Process worker = null;
        try
        {
            var limits = new ExtendedLimits(); limits.Basic.Flags = 0x2000; // KILL_ON_JOB_CLOSE
            if (!SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(limits))) throw new System.ComponentModel.Win32Exception();
            using (var gate = new EventWaitHandle(false, EventResetMode.ManualReset, gateName))
            using (Process current = Process.GetCurrentProcess())
            {
                worker = Process.Start(new ProcessStartInfo(current.MainModule.FileName, "--job-launcher " + gateName) { UseShellExecute = false, CreateNoWindow = true });
                if (!AssignProcessToJobObject(job, worker.Handle)) throw new System.ComponentModel.Win32Exception();
                gate.Set();
                if (!WaitForMarker(marker, "False")) throw new Exception("Independent child was not started outside the host job");
                CloseHandle(job); job = IntPtr.Zero;
                if (!worker.WaitForExit(5000)) throw new Exception("Disposable host job did not terminate its worker");
                if (!WaitForMarker(marker, "survived")) throw new Exception("Independent child did not survive host job closure");
            }
        }
        finally
        {
            if (job != IntPtr.Zero) CloseHandle(job);
            if (worker != null) { if (!worker.HasExited) worker.Kill(); worker.Dispose(); }
        }
    }
    private static void Check(bool expected, string agent, string name, string path, string command, string names)
    {
        if(AgentUsageWatcher.Matches(agent,name,path,command,names)!=expected)throw new Exception("Process classifier failed: "+agent+" / "+name);
    }
    public static void Main(string[] args)
    {
        string marker = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "independent-child.txt");
        if (Array.IndexOf(args, "--independent") >= 0)
        {
            File.WriteAllText(marker, AgentUsageWatcher.InJob().ToString());
            Thread.Sleep(2000);
            File.WriteAllText(marker, "survived");
            return;
        }
        if (args.Length == 2 && args[0] == "--job-launcher")
        {
            using (var gate = EventWaitHandle.OpenExisting(args[1]))
                if (!gate.WaitOne(10000)) throw new Exception("Host test gate timed out");
            using (Process current = Process.GetCurrentProcess())
                AgentUsageWatcher.RelaunchIndependent(current.MainModule.FileName, AppDomain.CurrentDomain.BaseDirectory);
            Thread.Sleep(15000);
            return;
        }
        Check(true,"codex","ChatGPT.exe",@"C:\Program Files\WindowsApps\OpenAI.Codex_1\app\ChatGPT.exe","","ChatGPT.exe, codex.exe");
        Check(false,"codex","ChatGPT.exe",@"C:\Other\ChatGPT.exe","","ChatGPT.exe, codex.exe");
        Check(false,"codex","codex.exe","","codex.exe app-server --listen stdio://","codex.exe");
        Check(true,"codex","codex.exe","","codex.exe exec test","codex.exe");
        Check(true,"claude","node.exe","",@"node C:\npm\@anthropic-ai\claude-code\cli.js","claude.exe");
        Check(false,"claude","node.exe","","node unrelated.js","claude.exe");
        Check(true,"deepseek","MyAgent.exe","","","MyAgent.exe");
        Check(false,"deepseek","Other.exe","","","MyAgent.exe");
        Check(false,"deepseek","MyAgent.exe","","","bad' OR Name='MyAgent.exe");
        Console.WriteLine("9 watcher classifier checks passed");
        if (File.Exists(marker)) File.Delete(marker);
        CheckHostExit(marker);
        Console.WriteLine("Independent startup check passed: child survives closing a kill-on-close host job");
    }
}
