using System;
internal static class WatcherSelfTest
{
    private static void Check(bool expected, string agent, string name, string path, string command, string names)
    {
        if(AgentUsageWatcher.Matches(agent,name,path,command,names)!=expected)throw new Exception("Process classifier failed: "+agent+" / "+name);
    }
    public static void Main()
    {
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
    }
}
