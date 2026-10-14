param([ValidatePattern('^[A-Za-z0-9_-]{1,40}$')][string]$Label='before',[ValidateRange(1,120)][int]$Samples=3,[ValidateRange(1,60)][int]$IntervalSeconds=5)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force -Path (Join-Path $taskRoot 'work') | Out-Null
$cpuCount=[Environment]::ProcessorCount
$results=@()
for($sample=0;$sample -lt $Samples;$sample++){
  $inventory=Get-CimInstance Win32_Process
  $main=$inventory | Where-Object { $_.Name -eq 'electron.exe' -and $_.ExecutablePath -like "$taskRoot\*" -and $_.CommandLine -notlike '*--type=*' }
  $ids=[Collections.Generic.HashSet[int]]::new()
  foreach($p in $main){[void]$ids.Add([int]$p.ProcessId)}
  do{$added=0;foreach($p in $inventory){if($ids.Contains([int]$p.ParentProcessId)-and $ids.Add([int]$p.ProcessId)){$added++}}}while($added)
  foreach($p in $inventory){if($p.ExecutablePath -eq "$taskRoot\runtime\AgentUsageWatcher.exe"){[void]$ids.Add([int]$p.ProcessId)}}
  $processes=@(foreach($id in $ids){Get-Process -Id $id -ErrorAction SilentlyContinue})
  $cpuById=@{};foreach($p in $processes){$cpuById[$p.Id]=$p.CPU}
  $start=[DateTime]::UtcNow
  Start-Sleep -Seconds $IntervalSeconds
  $elapsed=([DateTime]::UtcNow-$start).TotalSeconds
  $next=@(foreach($id in $ids){Get-Process -Id $id -ErrorAction SilentlyContinue})
  $cpuDelta=0;foreach($p in $next){if($cpuById.ContainsKey($p.Id)){$cpuDelta+=[Math]::Max(0,$p.CPU-$cpuById[$p.Id])}}
  $gpuPeak=$null;$gpuDedicated=$null;$gpuShared=$null
  try{
    $engines=Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine | Where-Object {$_.Name -match '^pid_(\d+)_' -and $ids.Contains([int]$Matches[1])}
    $gpuPeak=($engines | Measure-Object UtilizationPercentage -Maximum).Maximum
    $gpuMemory=Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUProcessMemory | Where-Object {$_.Name -match '^pid_(\d+)_' -and $ids.Contains([int]$Matches[1])}
    $gpuDedicated=[Math]::Round(($gpuMemory | Measure-Object DedicatedUsage -Sum).Sum/1MB,1)
    $gpuShared=[Math]::Round(($gpuMemory | Measure-Object SharedUsage -Sum).Sum/1MB,1)
  }catch{}
  $results+=[pscustomobject]@{at=[DateTime]::UtcNow.ToString('o');processCount=$next.Count;workingSetMiB=[Math]::Round(($next | Measure-Object WorkingSet64 -Sum).Sum/1MB,1);privateMiB=[Math]::Round(($next | Measure-Object PrivateMemorySize64 -Sum).Sum/1MB,1);cpuPercent=[Math]::Round($cpuDelta/$elapsed/$cpuCount*100,3);gpuEnginePeakPercent=$gpuPeak;gpuDedicatedMiB=$gpuDedicated;gpuSharedMiB=$gpuShared;processes=@($next | Select-Object Id,ProcessName,@{n='workingSetMiB';e={[Math]::Round($_.WorkingSet64/1MB,1)}},@{n='privateMiB';e={[Math]::Round($_.PrivateMemorySize64/1MB,1)}})}
}
$report=[pscustomobject]@{label=$Label;logicalCpuCount=$cpuCount;intervalSeconds=$IntervalSeconds;samples=$results}
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath "$taskRoot\work\resources-$Label.json" -Encoding utf8
$results | Select-Object processCount,workingSetMiB,privateMiB,cpuPercent,gpuEnginePeakPercent,gpuDedicatedMiB,gpuSharedMiB | ConvertTo-Json -Compress
