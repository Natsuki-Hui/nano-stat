; NanoStat NSIS 安装器自定义 Hook
; 由 tauri.conf.json > bundle > windows > nsis > installerHooks 引用。
;
; PREINSTALL：关闭运行中的 NanoStat/lhm-bridge（旧版本升级覆盖安装时文件被锁定）。
; POSTINSTALL：静默安装 PawnIO 内核驱动。
;   LibreHardwareMonitor 桥接（lhm-bridge）通过 PawnIO 读取 CPU 封装功耗与
;   MSR 级温度；未安装 PawnIO 时应用自动回退 WMI 采集（功能降级不阻塞）。
;   PawnIO_setup.exe 由安装包作为资源释放到 $INSTDIR（SHA-256 校验过的
;   官方 2.2.0 签名版），静默参数为官方 CLI 形式 `-install -silent`；
;   退出码 3010 表示需要重启系统。
; 卸载时**不**卸载 PawnIO（系统级共享驱动，其他监控软件可能依赖）。

!macro NSIS_HOOK_PREINSTALL
  DetailPrint "正在关闭运行中的 NanoStat..."
  ; /IM 按镜像名杀进程；不存在时 taskkill 返回非零但 NSIS 不受影响
  nsExec::ExecToLog 'taskkill /F /IM NanoStat.exe'
  nsExec::ExecToLog 'taskkill /F /IM lhm-bridge.exe'
  Sleep 500
!macroend

!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "正在安装 PawnIO 驱动（硬件温度/功耗采集依赖）..."
  ExecWait '"$INSTDIR\PawnIO_setup.exe" -install -silent' $R0
  IntCmp $R0 3010 PawnIO_Reboot PawnIO_Done PawnIO_Done
PawnIO_Reboot:
  MessageBox MB_OK|MB_ICONINFORMATION "PawnIO 驱动已安装，需要重启系统后完全生效。" /SD IDOK
PawnIO_Done:
!macroend
